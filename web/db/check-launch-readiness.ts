import { checkLaunchReadiness } from '@/lib/operations/launch-readiness';

const result = checkLaunchReadiness(process.env);
console.log(JSON.stringify({ event: 'launch_readiness.checked', ...result }));
if (!result.ready) process.exitCode = 1;
