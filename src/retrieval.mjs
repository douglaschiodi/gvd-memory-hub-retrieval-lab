import {contentTerms} from './semantic-coverage.mjs';
import {filterEvidenceCandidates} from './evidence-verification.mjs';
const normalize=t=>t.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'');
const stem=t=>normalize(t).replace(/(?:mente|coes|cao|oes|ais|eis|ados|adas|ando|endo|indo|ar|er|ir|s)$/,'');
const terms=t=>contentTerms(t,500).map(stem);
const orderedTerms=t=>{const allowed=new Set(terms(t));return (t.match(/[\p{L}\p{N}]+/gu)||[]).map(stem).filter(w=>allowed.has(w));};
const MONTHS='janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro'.split(' ');
export function referenceMonth(query){const q=normalize(query);if(!/\b(memoria|avaliacao|analise|relatorio|decisao|questionario)\b/.test(q))return null;const m=q.match(/\bde (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/);return m?MONTHS.indexOf(m[1])+1:null;}
function datedMonth(title){const a=title.match(/(?:^|[-_\\/ ])([0-3]\d)([01]\d)(20\d\d)(?=[-_\\/. ]|$)/),b=title.match(/(?:^|[-_\\/ ])(20\d\d)([01]\d)([0-3]\d)(?=[-_\\/. ]|$)/);return a?Number(a[2]):b?Number(b[2]):null;}
export function explicitNames(query){return [...query.matchAll(/[\p{L}][\p{L}\p{N}_-]*/gu)].filter(m=>m.index>0&&m[0].length>=3&&/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/u.test(m[0])&&!['Qual','Quais','Como','Quando','Onde','Quanto'].includes(m[0])).map(m=>normalize(m[0]));}
export function queryIntent(query){const q=normalize(query);return /^\s*quem\s+(?:pode\s+)?(?:confirm[ae]r?|autoriza[r]?|valida[r]?)\b/.test(q)&&/\b(?:decisao|decisoes|escolha|escolhas|restricao|restricoes)\b/.test(q)?'confirmation_policy':'subject_retrieval';}
function requiredNames(query){
 // A request for the confirmation rule is not evidence of a person's actual approval.
 if(queryIntent(query)!=='confirmation_policy')return explicitNames(query);
 const roleNames=query.match(/\batribu[ií]d[ao]s?\s+(?:a|ao|à)\s+([\p{Lu}][\p{L}-]*(?:\s+[\p{Lu}][\p{L}-]*)*)/u)?.[1];
 const roles=new Set(roleNames?explicitNames('para '+roleNames):[]);
 return explicitNames(query).filter(name=>!roles.has(name));
}
export function rankCandidates(query,candidates){
 const q=[...new Set(terms(query))],sequence=orderedTerms(query);const names=requiredNames(query),month=referenceMonth(query);
 const kind=normalize(query).match(/\b(avaliacao|analise|auditoria|relatorio|questionario|decisao|resumo)\b/)?.[1];
 const topic=terms(query.split(/\b(?:chegou a|foi|foram|pode|podemos|deve|devemos)\b/i)[0]).filter(t=>!MONTHS.includes(t));
 const documents=candidates.map(c=>({candidate:c,words:orderedTerms((c.title||'')+' '+(c.excerpt||'')+' '+(c.semantic_evidence||[]).map(x=>x.content).join('\n'))}));
 const match=(a,b)=>a===b||(a.length>=5&&b.length>=5&&(a.startsWith(b)||b.startsWith(a)));
 const weights=q.map(t=>Math.log(1+(documents.length+1)/(1+documents.filter(d=>d.words.some(w=>match(t,w))).length)));
 const total=weights.reduce((a,b)=>a+b,0)||1;
 return documents.map(({candidate:c,words})=>{
  const coverage=q.reduce((sum,t,i)=>sum+(words.some(w=>match(t,w))?weights[i]:0),0)/total;
  const pairs=sequence.slice(1).filter((t,i)=>words.some((w,j)=>match(sequence[i],w)&&match(t,words[j+1]||''))).length/Math.max(1,sequence.length-1);
  const context=normalize((c.title||'')+' '+(c.excerpt||'')+' '+(c.semantic_evidence||[]).map(x=>x.content).join(' '));
  const namesMatched=names.filter(n=>context.includes(n)).length;
  const nameCoverage=names.length?namesMatched/names.length:1;
  const sourceMonth=datedMonth(c.title||''),temporal=month&&sourceMonth?(month===sourceMonth ? .2 : -.2):0;
  let headingSupport=0;
  if(kind&&topic.length>=2){const headings=[c.title||'',...(c.excerpt||'').split('\n').filter(x=>/^#{1,6}\s/.test(x)),...(c.semantic_evidence||[]).flatMap(p=>p.content.split('\n').filter(x=>/^#{1,6}\s/.test(x)))];for(const heading of headings){const hw=orderedTerms(heading);if(!hw.some(w=>match(stem(kind),w)))continue;headingSupport=Math.max(headingSupport,topic.filter(t=>hw.some(w=>match(t,w))).length/topic.length);}}
  const lexical=coverage>0?(Number.isFinite(c.lexical_score)?c.lexical_score:coverage):0,semantic=c.semantic_score||0;
  const historical=Boolean(c.provenance?.imported_state),current=!historical&&['active','confirmed','current'].includes(c.status);
  const authority=current?(['decision','restriction'].includes(c.type)?.35:.25):0;
  const score=Math.max(semantic,.75*lexical)+.15*Math.min(semantic,lexical)+.3*pairs+.5*nameCoverage-.25*(1-nameCoverage)+temporal+.35*headingSupport+authority;
  return {...c,relevance_score:score,relevance_evidence:{lexical_coverage:coverage,ordered_pairs:pairs,named_terms:names.length,named_terms_supported:namesMatched,reference_month:month,source_month:sourceMonth,heading_support:headingSupport,current_source_priority:authority}};
 }).sort((a,b)=>b.relevance_score-a.relevance_score||String(a.id).localeCompare(String(b.id)));
}
export function pageCandidates(items,offset,limit){return {items:items.slice(offset,offset+limit),offset,next_offset:offset+limit<items.length?offset+limit:null};}
export function groupCheckoutSnapshots(items){
 const groups=new Map();
 for(const item of items){const path=(item.title||'').replaceAll('\\','/').toLowerCase(),key=path.replace(/^\.worktrees\/[^/]+\//,'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 const out=[];for(const group of groups.values()){const primary=group.find(x=>!/^\.worktrees[\\/]/i.test(x.title||''));if(primary&&group.length>1){out.push({...primary,related_snapshots:group.filter(x=>x!==primary).map(x=>({id:x.id,version:x.version,title:x.title})),snapshot_preference:'primary_checkout'});}else out.push(...group);}
 return out.sort((a,b)=>b.relevance_score-a.relevance_score||String(a.id).localeCompare(String(b.id)));
}
export function createSemanticSearch({rpc,embed}){return async(hash,args)=>{
 const offset=Math.max(0,args.offset||0),limit=Math.min(100,Math.max(1,args.limit||30));
 const candidate_terms=[...new Set(contentTerms(args.query,24).flatMap(t=>[t,normalize(t)]))].map(t=>'"'+t.replaceAll('"','')+'"').join(' OR ');
 const names=requiredNames(args.query),named_query=names.map(t=>'"'+t+'"').join(' ');
 const request={...args,candidate_terms,folded_query:normalize(args.query),...(named_query?{named_query}:{}),offset:0,limit:40};
 const raw=await rpc(hash,'memory_search',request);
 const lexical=await rpc(hash,'memory_search',{...request,candidate_order:'lexical'});
 const cache=new Map();const cached=async text=>{if(cache.has(text))return cache.get(text);const value=await embed(text);if(cache.size<512)cache.set(text,value);return value;};
 const pool=[...new Map([...raw.items,...lexical.items].map(x=>[x.id+'@'+x.version,x])).values()];
 const ranked=rankCandidates(args.query,pool);
 const eligible=ranked.filter(c=>!names.length||names.every(n=>normalize((c.title||'')+' '+(c.excerpt||'')+' '+(c.semantic_evidence||[]).map(x=>x.content).join(' ')).includes(n)));
 const checked=await filterEvidenceCandidates(args.query,eligible,cached);
 return {...raw,...pageCandidates(groupCheckoutSnapshots(checked.items),offset,limit),query_intent:queryIntent(args.query),...(queryIntent(args.query)==='confirmation_policy'?{entity_assertion:false}:{}),candidate_scope:'top_40_semantic_and_40_lexical',candidate_pool_exhaustive:raw.next_offset===null&&lexical.next_offset===null,retrieval_only:true,evidence_verification_required:true,score_is_probability:false,semantic_validation:{policy:'reranked-typed-evidence-v2',mode:'enforce',candidate_count:pool.length,rejected_count:pool.length-checked.items.length,evaluations:checked.evaluations}};
};}
