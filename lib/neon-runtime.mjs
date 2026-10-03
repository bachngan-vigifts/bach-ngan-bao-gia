import { createNeonDatabase } from './neon-db.mjs';
import { createNeonBucket } from './neon-bucket.mjs';
export function neonTestRuntime(env){
  if(!env.NEON_MIGRATION_DATABASE_URL||new URL(env.NEON_MIGRATION_DATABASE_URL).hostname!=='ep-odd-fog-b3mgizig-pooler.c-4.ap-southeast-1.aws.neon.tech')throw Error('Neon test database is not configured');
  if(env.NEON_MIGRATION_S3_ENDPOINT!=='https://br-jolly-sky-b3ytom90.storage.c-4.ap-southeast-1.aws.neon.tech')throw Error('Neon test storage is not configured');
  return {...env,DB:createNeonDatabase(env.NEON_MIGRATION_DATABASE_URL),FILES:createNeonBucket({endpoint:env.NEON_MIGRATION_S3_ENDPOINT,region:'ap-southeast-1',bucket:'bao-gia-files',accessKey:env.NEON_MIGRATION_S3_ACCESS_KEY,secret:env.NEON_MIGRATION_S3_SECRET}),NEON_DATABASE_URL:undefined};
}
