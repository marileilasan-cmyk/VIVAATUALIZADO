import { timingSafeEqual } from 'node:crypto';
const url=process.env.UPSTASH_REDIS_REST_URL;
const token=process.env.UPSTASH_REDIS_REST_TOKEN;
function authorized(req){
 const expected='593120';
 const supplied=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!expected||!supplied)return false;
 const a=Buffer.from(supplied),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function redis(...args){
 const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(!r.ok)throw new Error('Falha no armazenamento');
 const j=await r.json();if(j.error)throw new Error('Falha no armazenamento');return j.result;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!url||!token)return res.status(503).json({error:'Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN na Vercel'});
 try{
  if(req.method==='POST'){
   const x=req.body||{};
   const cpf=String(x.cpf||'').replace(/\D/g,''),tel=String(x.telefone||'').replace(/\D/g,'');
   const qtd=Number(x.quantidade),valor=Number(x.valor),id=String(x.transaction_id||'');
   if(cpf.length!==11||tel.length<10||!Number.isInteger(qtd)||qtd<15||qtd>500||Math.abs(valor-qtd*.49)>.011||!/^[-\w]{5,128}$/.test(id))return res.status(400).json({error:'Dados inválidos'});
   const item={id,cpf,nome:String(x.nome||'').slice(0,120),data_nascimento:String(x.data_nascimento||'').slice(0,30),telefone:tel,quantidade:qtd,valor,status:'pix_gerado',criado_em:new Date().toISOString()};
   await redis('SET',`ficha:${id}`,JSON.stringify(item),'EX',60*60*24*90);
   await redis('ZADD','fichas:indices',Date.now(),id);
   return res.status(201).json({ok:true});
  }
  if(!authorized(req))return res.status(401).json({error:'Acesso não autorizado'});
  if(req.method==='GET'){
   const ids=await redis('ZREVRANGE','fichas:indices',0,199)||[];
   const rows=await Promise.all(ids.map(async id=>{const data=await redis('GET',`ficha:${id}`);try{return JSON.parse(data)}catch{return null}}));
   return res.status(200).json({fichas:rows.filter(Boolean)});
  }
  if(req.method==='DELETE'){
   const id=String(req.query.id||'');if(!/^[-\w]{5,128}$/.test(id))return res.status(400).json({error:'ID inválido'});
   await redis('DEL',`ficha:${id}`);await redis('ZREM','fichas:indices',id);
   return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:'Método não permitido'});
 }catch(e){return res.status(500).json({error:'Erro ao processar ficha'});}
}
