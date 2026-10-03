import googleBusinessHandler from '../google-business.mjs';

// Exact OAuth redirect URI endpoint. Keep callback processing in the consolidated
// Google Business handler so token exchange and signed-state validation have one source of truth.
export default async function handler(req,res){
  req.query={...(req.query||{}),action:'callback'};
  return googleBusinessHandler(req,res);
}
