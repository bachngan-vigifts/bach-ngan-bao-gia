import { neon, Client, neonConfig, types } from '@neondatabase/serverless';
import { neonTableContract } from './neon-table-contract.mjs';

types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Integer exceeds application precision');return n;});
types.setTypeParser(1700,value=>{const n=Number(value);if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)throw Error('Numeric exceeds application precision');return n;});
if(typeof WebSocket!=='undefined')neonConfig.webSocketConstructor=WebSocket;
const quote=s=>'"'+s.replaceAll('"','""')+'"';
function safeError(error){const e=Error(error.code==='23505'?'UNIQUE constraint failed':'Cơ sở dữ liệu Neon chưa thực hiện được yêu cầu'+(error.code?' ('+error.code+')':'')+'.');e.code=error.code;return e;}

export function translateSql(source,previousChanges=0){
  const protectedValues=[];
  let sql=source.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|--[^\n]*|\/\*[\s\S]*?\*\//g,value=>{
    if(value.startsWith('--')||value.startsWith('/*'))return ' ';
    if(/^(["`\[])rowid(["`\]])$/i.test(value))value='"source_rowid"';
    const key='__BN_PROTECTED_'+protectedValues.length+'__';protectedValues.push(value);return key;
  }).trim().replace(/;\s*$/,'');
  if(sql.includes(';'))throw Error('Only one SQL statement is supported');
  const restore=value=>value.replace(/__BN_PROTECTED_(\d+)__/g,(_,n)=>protectedValues[Number(n)]);
  sql=sql.replace(/json_extract\(\s*([\w.]+)\s*,\s*(__BN_PROTECTED_\d+__)\s*\)/gi,(_,expression,path)=>{
    const value=restore(path);if(!/^'\$\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*'$/.test(value))throw Error('Unsupported JSON path');
    return '('+expression+"::jsonb #>> '{"+value.slice(3,-1).split('.').join(',')+"}')";
  });
  sql=sql.replace(/\bchanges\s*\(\s*\)/gi,String(previousChanges)).replace(/\browid\b/gi,'source_rowid');
  let count=0;sql=sql.replace(/\?/g,()=>'$'+(++count));
  // A NULL-only occurrence has no inferable parameter type in PostgreSQL.
  sql=sql.replace(/\$(\d+)\s+IS\s+(NOT\s+)?NULL/gi,(_,n,not)=>'$'+n+'::text IS '+(not||'')+'NULL');
  sql=sql.replace(/\b(email)\s*=\s*(\$\d+)\s+COLLATE\s+NOCASE\b/gi,'lower($1)=lower($2::text)');
  sql=sql.replace(/\bquote_no\s+COLLATE\s+NOCASE\b/gi,'lower(quote_no)');
  if(/\bCOLLATE\s+NOCASE\b/i.test(sql))throw Error('Unsupported NOCASE expression');
  sql=sql.replace(/\bLIKE\b/gi,'ILIKE').replace(/\bAS\s+INTEGER\b/gi,'AS BIGINT');
  if(/^INSERT\s+OR\s+IGNORE\b/i.test(sql))sql=sql.replace(/^INSERT\s+OR\s+IGNORE\b/i,'INSERT')+' ON CONFLICT DO NOTHING';
  if(/^INSERT\s+OR\s+REPLACE\b/i.test(sql)){
    sql=sql.replace(/^INSERT\s+OR\s+REPLACE\b/i,'INSERT');
    const match=sql.match(/^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
    const table=match&&restore(match[1]).replace(/^"|"$/g,''),contract=neonTableContract[table];
    if(!contract?.primary.length)throw Error('Replacement requires a known primary key');
    const columns=match[2].split(',').map(c=>restore(c.trim()).replace(/^"|"$/g,''));
    const updates=columns.filter(c=>!contract.primary.includes(c));
    sql+=' ON CONFLICT ('+contract.primary.map(quote).join(',')+') '+(updates.length?'DO UPDATE SET '+updates.map(c=>quote(c)+'=excluded.'+quote(c)).join(','):'DO NOTHING');
  }
  // D1 retains the spelling of result aliases. PostgreSQL otherwise folds them.
  sql=sql.replace(/\bAS\s+([A-Za-z_]\w*)/gi,(all,name)=>/^(TEXT|BIGINT|INTEGER|REAL|NUMERIC|BOOLEAN|DOUBLE|VARCHAR|__BN_PROTECTED_\d+__)$/i.test(name)?all:'AS '+quote(name));
  if(/\b(PRAGMA|sqlite_master|AUTOINCREMENT|strftime|datetime)\b/i.test(sql))throw Error('Unsupported SQLite-only statement');
  return {text:restore(sql),parameterCount:count};
}
const wrapped=result=>({success:true,results:result.rows||[],meta:{changes:['INSERT','UPDATE','DELETE'].includes(result.command)?result.rowCount||0:0,last_row_id:null,duration:0}});

export function createNeonDatabase(connectionString,options={}){
  const http=options.http||neon(connectionString,{fullResults:true});
  const clientFactory=options.clientFactory||(()=>new Client({connectionString}));
  const execute=async(statement,client,previous=0)=>{
    const translated=translateSql(statement.sql,previous);
    if(translated.parameterCount!==statement.values.length)throw Error('Parameter count mismatch');
    return wrapped(client?await client.query(translated.text,statement.values):await http.query(translated.text,statement.values));
  };
  const db={provider:'neon',
    prepare(sql){
      const statement={sql,values:[],bind(...values){return {...statement,values};},
        async all(){try{return await execute(this);}catch(e){throw safeError(e);}},
        async run(){return this.all();},
        async first(column){const row=(await this.all()).results[0];return row?(column?row[column]:row):null;},
        async raw(options={}){const result=await this.all(),data=result.results.map(row=>Object.values(row));return options.columnNames&&result.results.length?[Object.keys(result.results[0]),...data]:data;}};
      return statement;
    },
    async batch(statements){
      for(let attempt=0;attempt<3;attempt++){
        const client=clientFactory();
        try{
          await client.connect();await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
          const results=[];let previous=0;
          for(const statement of statements){const r=await execute(statement,client,previous);results.push(r);if(/^\s*(INSERT|UPDATE|DELETE)\b/i.test(statement.sql))previous=r.meta.changes;}
          await client.query('COMMIT');return results;
        }catch(e){
          try{await client.query('ROLLBACK');}catch{}
          if(!['40001','40P01'].includes(e.code)||attempt===2)throw safeError(e);
        }finally{try{await client.end();}catch{}}
      }
    },
    // Used only by the protected migration controller, never exposed as SQL input.
    async native(text,values=[]){try{return await http.query(text,values);}catch(e){throw safeError(e);}},
  };
  return db;
}
