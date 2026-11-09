// Typed factual questions need a matching fact, beyond aggregate vector similarity.
import {contentTerms} from './semantic-coverage.mjs';
const normalize=t=>t.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'');
export function evidenceContract(query){
 const q=normalize(query);
 if(/\b(qual|quanto|quantos)\b/.test(q)&&/\b(orcamento|preco|custo|custa|valor|faturamento|receita|verba)\b/.test(q))return 'money';
 if(/\b(qual|que)\s+(a\s+|o\s+)?(data|dia)\b/.test(q)||/\bem que dia\b/.test(q))return 'date';
 return null;
}
const patterns={money:/(?:R\$|US\$|BRL|USD|EUR|€|\$)\s*\d[\d.,]*|\d[\d.,]*\s*(?:reais|dolares|euros)/giu,date:/\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s+de\s+[a-zç]+(?:\s+de\s+\d{4})?/giu};
function cosine(a,b){let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):0;}
export async function verifyEvidence(query,content,embed,context=''){
 const contract=evidenceContract(query);if(!contract)return {accepted:true,contract:null};
 const product=normalize(query).match(/\b(?:plano|produto|pacote|servico|licenca|modelo|categoria)\s+([a-z0-9_-]{3,})/)?.[1];
 const rowName=product&&!['por','para','que','com'].includes(product)?product:null;
 const units=[['hectare',/\b(?:hectares?|ha)\b/],['month',/\b(?:mes|mensal)\b/],['user',/\b(?:usuarios?|utilizadores?)\b/],['year',/\b(?:ano|anual)\b/],['hour',/\b(?:hora|horario)\b/]];
 const requestedUnit=contract==='money'?units.find(([,re])=>re.test(normalize(query))):null;
 const header=normalize(content).split('\n').find(line=>line.includes('|')&&/preco|valor|tarifa|custo/.test(line));
 const declaredUnit=header?units.find(([,re])=>re.test(header)):null;
 if(requestedUnit&&declaredUnit&&requestedUnit[0]!==declaredUnit[0])return {accepted:false,contract,reason:'incompatible_price_unit'};
 const spans=[];
 let namedRow=false;
 for(const match of content.matchAll(patterns[contract])){
  const lineStart=content.lastIndexOf('\n',match.index)+1;const lineEnd=content.indexOf('\n',match.index);const line=content.slice(lineStart,lineEnd<0?content.length:lineEnd);
  if(contract==='money'&&rowName){const row=new RegExp('(^|[^a-z0-9])'+rowName+'($|[^a-z0-9])');if(!row.test(normalize(line)))continue;namedRow=true;}
  if(contract==='date'&&/^\s*(?:[-*#>]\s*)*(atualizad[oa]|data de atualizacao|updated|gerado|exportado)/.test(normalize(line)))continue;
  // Preserve headings/column labels around terse table cells; values alone have little meaning.
  spans.push(content.slice(Math.max(0,match.index-450),Math.min(content.length,match.index+match[0].length+240)));
 }
 if(!spans.length)return {accepted:false,contract,reason:'missing_typed_fact'};
 if(contract==='money'&&rowName&&namedRow&&content.includes('|')&&(!requestedUnit||declaredUnit))return {accepted:true,contract,reason:'explicit_product_price_row',unit:declaredUnit?.[0]||null};
 // A bounded indexed fragment is an additional context level for terse tables.
 if(contract==='money'&&content.length<=2000)spans.push(content);
 const intent=new Set('orcamento preco custo custa valor verba aprovado aprovada documentado documentada faturamento receita'.split(' '));
 const dateIntent=new Set('data dia quando vence termina vencimento'.split(' '));
 const subject=contentTerms(query).filter(t=>!(contract==='money'?intent:dateIntent).has(normalize(t))).join(' ');
 const q=await embed(query),subjectVector=subject?await embed(subject):null;let best=0,bestSubject=0,accepted=false;
 for(const span of [...spans.slice(0,11),spans.at(-1)]){const vector=await embed((contract==='money'&&context?context.slice(0,400)+'\n':'')+span),similarity=cosine(q,vector),subjectSimilarity=subjectVector?cosine(subjectVector,vector):1;best=Math.max(best,similarity);bestSubject=Math.max(bestSubject,subjectSimilarity);if(similarity>=.3&&subjectSimilarity>=.36)accepted=true;}
 return {accepted,contract,fact_similarity:best,subject_similarity:bestSubject,reason:accepted?'supported_fact':'unrelated_fact'};
}
export async function filterEvidenceCandidates(query,candidates,embed){
 const items=[],evaluations=[];
 for(const candidate of candidates){let best=null,fragment=null;
  for(const part of candidate.semantic_evidence||[]){const check=await verifyEvidence(query,part.content,embed,candidate.excerpt||candidate.title||'');if(!best||check.accepted||(!best.accepted&&(check.fact_similarity||0)>(best.fact_similarity||0))){best=check;fragment=part;}if(check.accepted)break;}
  evaluations.push({id:candidate.id,subject_key:candidate.subject_key,coverage:best});
  if(best?.accepted)items.push({...candidate,excerpt:fragment.content.slice(0,1200),evidence_validation:best,evidence_position:fragment.position});
 }
 return {items,rejected_count:candidates.length-items.length,evaluations};
}
