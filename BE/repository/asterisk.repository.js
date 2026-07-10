import { safeQuery } from '../db.js';

export async function getCdrFromDb(limit) {
  return safeQuery(
    `SELECT calldate,clid,src,dst,dcontext,channel,dstchannel,lastapp,lastdata,duration,billsec,disposition,amaflags,accountcode,uniqueid,userfield FROM cdr ORDER BY calldate DESC LIMIT ?`,
    [limit]
  );
}
