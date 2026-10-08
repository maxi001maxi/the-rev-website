import threadsHandler from '../threads.mjs';

export default async function handler(req,res){
  req.query={...(req.query||{}),action:'callback'};
  return threadsHandler(req,res);
}
