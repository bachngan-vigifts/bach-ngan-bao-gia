// Sapo status and webhook active flags can arrive as strings or booleans.
export function isActiveSapoStaff(member){
 const inactive=v=>v===false||v===0||['false','0','inactive','disabled','deleted','terminated','resigned'].includes(String(v??'').trim().toLowerCase());
 return !inactive(member.active)&&!inactive(member.is_active)&&!inactive(member.status);
}
