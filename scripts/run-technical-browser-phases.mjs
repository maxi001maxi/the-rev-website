// Cross-platform launcher for exhaustive two-phase browser QA.
// Each phase is a separate Node/Chromium lifetime. A failure in either
// stops the script and propagates a nonzero exit code.
import {spawnSync} from 'node:child_process';
import path from 'node:path';

for(const phase of ['instrumentation','visual']){
  const result=spawnSync(process.execPath,['scripts/qa-technical-site.mjs'],{
    cwd:process.cwd(),
    env:{...process.env,TECH_QA_PHASE:phase,
      TECH_QA_OUT:path.join('qa-out','technical',phase)},
    stdio:'inherit',
    timeout:270000
  });
  if(result.error){console.error(`Technical QA ${phase}: ${result.error.message}`);process.exit(1);}
  if(result.status!==0){
    console.error(`Technical QA ${phase}: failed (${result.status??result.signal??'unknown'})`);
    process.exit(result.status??1);
  }
}
