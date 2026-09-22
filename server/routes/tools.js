const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAuth } = require('../auth');
const { rateLimit } = require('../middleware/security');
const { getPool, newId } = require('../db');
const { tavilySearch, openAIImage, executeCode, createFile, envBool } = require('../services/tools');

function poolOr503(res) { const p = getPool(); if (!p) { res.status(503).json({ error:{message:'Database is not configured.'} }); return null; } return p; }
function hashToken(v) { return crypto.createHash('sha256').update(v).digest('hex'); }
function ipHash(req) { const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'; return hashToken(`${process.env.SESSION_SECRET || 'rockstar'}:${ip}`); }
async function audit(req, action, resourceType, resourceId, metadata = {}) {
  const p = getPool(); if (!p) return;
  await p.query('INSERT INTO audit_logs (id,user_id,action,resource_type,resource_id,metadata,ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)', [newId(), req.user?.sub || null, action, resourceType || null, resourceId || null, metadata, ipHash(req)]).catch(()=>{});
}

router.get('/status', requireAuth, async (req,res,next)=>{
  try {
    res.json({ ok:true, tools:{
      webSearch: Boolean(process.env.TAVILY_API_KEY),
      imageGeneration: Boolean(process.env.OPENAI_API_KEY),
      imageEditing: Boolean(process.env.OPENAI_API_KEY),
      codeExecution: envBool('ENABLE_CODE_EXECUTION', false) && Boolean(process.env.PISTON_BASE_URL || 'https://emkc.org/api/v2/piston'),
      docx: true, xlsx: true, pptx: true, pdf: true, voiceTts: Boolean(process.env.OPENAI_API_KEY),
      sharing: Boolean(getPool()), jobs: Boolean(getPool()), audit: Boolean(getPool())
    }});
  } catch(e){next(e)}
});

router.post('/web-search', rateLimit({windowMs:60000,max:20,keyFn:req=>req.user?.sub||req.ip}), requireAuth, async (req,res,next)=>{
  try { const query=String(req.body?.query||'').trim(); if(!query) return res.status(400).json({error:{message:'Search query is required.'}}); const result=await tavilySearch({query,maxResults:req.body?.maxResults}); await audit(req,'web.search','search',null,{query,results:result.results.length}); res.json({ok:true,...result}); } catch(e){next(e)}
});

async function readDataUrl(dataUrl) {
  const m=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/s); if(!m) throw Object.assign(new Error('A valid image data URL is required.'),{statusCode:400});
  const b=Buffer.from(m[2],'base64'); if(b.length>8*1024*1024) throw Object.assign(new Error('Image exceeds 8 MB.'),{statusCode:413}); return {mime:m[1],buffer:b};
}
router.post('/image/generate', rateLimit({windowMs:60000,max:5,keyFn:req=>req.user?.sub||req.ip}), requireAuth, async(req,res,next)=>{
  try { const prompt=String(req.body?.prompt||'').trim(); if(!prompt) return res.status(400).json({error:{message:'Image prompt is required.'}}); const images=await openAIImage({prompt,size:req.body?.size,quality:req.body?.quality,background:req.body?.background,n:req.body?.n}); await audit(req,'image.generate','image',null,{count:images.length}); res.json({ok:true,images}); } catch(e){next(e)}
});
router.post('/image/edit', rateLimit({windowMs:60000,max:5,keyFn:req=>req.user?.sub||req.ip}), requireAuth, async(req,res,next)=>{
  try { const {buffer,mime}=await readDataUrl(req.body?.image); const prompt=String(req.body?.prompt||'').trim(); if(!prompt) return res.status(400).json({error:{message:'Edit instruction is required.'}}); const images=await openAIImage({prompt,imageBuffer:buffer,imageMime:mime,size:req.body?.size,quality:req.body?.quality,background:req.body?.background,n:1}); await audit(req,'image.edit','image',null,{count:images.length}); res.json({ok:true,images}); } catch(e){next(e)}
});

router.post('/code/execute', rateLimit({windowMs:60000,max:10,keyFn:req=>req.user?.sub||req.ip}), requireAuth, async(req,res,next)=>{
  try { const result=await executeCode(req.body||{}); await audit(req,'code.execute','execution',null,{language:req.body?.language}); res.json({ok:true,...result}); } catch(e){next(e)}
});

router.post('/files/create', requireAuth, async(req,res,next)=>{
  const p=poolOr503(res); if(!p) return;
  try {
    const type=String(req.body?.type||'').toLowerCase(); const title=String(req.body?.title||'Rockstar AI Document').slice(0,200); const conversationId=req.body?.conversationId ? String(req.body.conversationId) : null;
    const file=createFile({type,title,text:req.body?.text||'',rows:req.body?.rows||[]}); if(file.buffer.length>12*1024*1024) return res.status(413).json({error:{message:'Generated file exceeds 12 MB.'}});
    const id=newId(); const filename=(String(req.body?.filename||title).replace(/[^a-z0-9._-]+/gi,'-').replace(/\.+$/,'')||'rockstar-file')+`.${file.ext}`;
    await p.query('INSERT INTO generated_files (id,user_id,conversation_id,filename,mime_type,size_bytes,data,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.user.sub,conversationId,filename,file.mime,file.buffer.length,file.buffer, new Date(Date.now()+7*86400000)]);
    await audit(req,'file.create','file',id,{type,bytes:file.buffer.length});
    res.json({ok:true,file:{id,filename,mimeType:file.mime,size:file.buffer.length,downloadUrl:`/api/tools/files/${id}`}});
  } catch(e){next(e)}
});

router.get('/files/:id', requireAuth, async(req,res,next)=>{
  const p=poolOr503(res); if(!p) return;
  try { const r=await p.query('SELECT filename,mime_type,data,expires_at FROM generated_files WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]); if(!r.rowCount) return res.status(404).json({error:{message:'File not found.'}}); const f=r.rows[0]; if(f.expires_at && new Date(f.expires_at)<new Date()) return res.status(410).json({error:{message:'File has expired.'}}); await audit(req,'file.download','file',req.params.id,{filename:f.filename}); res.setHeader('Content-Type',f.mime_type); res.setHeader('Content-Disposition',`attachment; filename="${String(f.filename).replace(/"/g,'')}"`); res.send(f.data); } catch(e){next(e)}
});

router.post('/share', requireAuth, async(req,res,next)=>{
  const p=poolOr503(res); if(!p) return;
  try { const conversationId=String(req.body?.conversationId||''); const check=await p.query('SELECT id FROM conversations WHERE id=$1 AND user_id=$2',[conversationId,req.user.sub]); if(!check.rowCount) return res.status(404).json({error:{message:'Conversation not found.'}}); const token=crypto.randomBytes(32).toString('base64url'); const id=newId(); const expires=req.body?.expiresInDays ? new Date(Date.now()+Math.min(Math.max(Number(req.body.expiresInDays)||7,1),30)*86400000) : null; await p.query('INSERT INTO shares (id,token_hash,user_id,conversation_id,expires_at) VALUES ($1,$2,$3,$4,$5)',[id,hashToken(token),req.user.sub,conversationId,expires]); await audit(req,'share.create','conversation',conversationId,{expires}); res.json({ok:true,shareId:id,token,url:`${process.env.PUBLIC_BASE_URL || ''}/share/${token}`,expiresAt:expires}); } catch(e){next(e)}
});
router.delete('/share/:id', requireAuth, async(req,res,next)=>{ const p=poolOr503(res); if(!p)return; try{await p.query('UPDATE shares SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]); await audit(req,'share.revoke','share',req.params.id); res.json({ok:true});}catch(e){next(e)} });
router.get('/share/:token', async(req,res,next)=>{
  const p=poolOr503(res); if(!p)return; try { const r=await p.query(`SELECT s.conversation_id,c.title FROM shares s JOIN conversations c ON c.id=s.conversation_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>NOW())`,[hashToken(req.params.token)]); if(!r.rowCount) return res.status(404).json({error:{message:'Share link is invalid or expired.'}}); const c=r.rows[0]; const m=await p.query(`SELECT role,content,model,created_at AS "createdAt" FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC`,[c.conversation_id]); res.json({ok:true,conversation:{id:c.conversation_id,title:c.title,messages:m.rows}}); } catch(e){next(e)}
});

router.post('/jobs', requireAuth, async(req,res,next)=>{
  const p=poolOr503(res); if(!p)return;
  try { const type=String(req.body?.type||''); if(!['file.create','web.search','code.execute','image.generate','image.edit'].includes(type)) return res.status(400).json({error:{message:'Unsupported job type.'}}); const id=newId(); await p.query('INSERT INTO jobs (id,user_id,type,status,payload) VALUES ($1,$2,$3,$4,$5)',[id,req.user.sub,type,'queued',req.body?.payload||{}]); await audit(req,'job.create','job',id,{type}); processJob(id,req.user.sub).catch(()=>{}); res.status(202).json({ok:true,job:{id,status:'queued'}}); }catch(e){next(e)}
});
router.get('/jobs/:id', requireAuth, async(req,res,next)=>{ const p=poolOr503(res);if(!p)return;try{const r=await p.query('SELECT id,type,status,result,error,created_at AS "createdAt",started_at AS "startedAt",finished_at AS "finishedAt" FROM jobs WHERE id=$1 AND user_id=$2',[req.params.id,req.user.sub]);if(!r.rowCount)return res.status(404).json({error:{message:'Job not found.'}});res.json({ok:true,job:r.rows[0]});}catch(e){next(e)} });

async function processJob(id,userId){
  const p=getPool(); if(!p)return; const claim=await p.query("UPDATE jobs SET status='running',started_at=NOW() WHERE id=$1 AND user_id=$2 AND status='queued' RETURNING payload,type",[id,userId]); if(!claim.rowCount)return; try{const {type,payload}=claim.rows[0]; let result; if(type==='web.search') result=await tavilySearch(payload); else if(type==='code.execute') result=await executeCode(payload); else if(type==='image.generate') result={images:await openAIImage(payload)}; else if(type==='image.edit'){const x=await readDataUrl(payload.image);result={images:await openAIImage({...payload,imageBuffer:x.buffer,imageMime:x.mime})};} else if(type==='file.create'){const f=createFile(payload);const fid=newId();const filename=(String(payload.filename||payload.title||'rockstar-file').replace(/[^a-z0-9._-]+/gi,'-')||'rockstar-file')+`.${f.ext}`;await p.query('INSERT INTO generated_files (id,user_id,filename,mime_type,size_bytes,data,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[fid,userId,filename,f.mime,f.buffer.length,f.buffer,new Date(Date.now()+7*86400000)]);result={file:{id:fid,filename,mimeType:f.mime,size:f.buffer.length,downloadUrl:`/api/tools/files/${fid}`}};} await p.query("UPDATE jobs SET status='completed',result=$2,finished_at=NOW() WHERE id=$1",[id,result]); }catch(e){await p.query("UPDATE jobs SET status='failed',error=$2,finished_at=NOW() WHERE id=$1",[id,e.message]).catch(()=>{});}
}

router.get('/audit', requireAuth, async(req,res,next)=>{const p=poolOr503(res);if(!p)return;try{const r=await p.query('SELECT action,resource_type AS "resourceType",resource_id AS "resourceId",metadata,created_at AS "createdAt" FROM audit_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200',[req.user.sub]);res.json({ok:true,logs:r.rows});}catch(e){next(e)}});

router.post('/voice/tts', rateLimit({windowMs:60000,max:10,keyFn:req=>req.user?.sub||req.ip}), requireAuth, async(req,res,next)=>{try{const key=process.env.OPENAI_API_KEY;if(!key)return res.status(503).json({error:{message:'TTS is not configured. Add OPENAI_API_KEY.'}});const text=String(req.body?.text||'').trim();if(!text||text.length>4096)return res.status(400).json({error:{message:'Text must be 1–4096 characters.'}});const base=process.env.OPENAI_BASE_URL||'https://api.openai.com/v1';const response=await fetch(`${base}/audio/speech`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',voice:req.body?.voice||'alloy',input:text,response_format:'mp3'})});if(!response.ok){const d=await response.json().catch(()=>({}));throw Object.assign(new Error(d?.error?.message||`TTS failed (${response.status})`),{statusCode:response.status});}const buf=Buffer.from(await response.arrayBuffer());await audit(req,'voice.tts','audio',null,{chars:text.length});res.setHeader('Content-Type','audio/mpeg');res.send(buf);}catch(e){next(e)}});

module.exports=router;
