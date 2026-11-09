// Query concepts must be supported by a retrieved evidence fragment, not just its average vector.
// These are grammatical stop words, not a list of topics or query-specific synonyms.
const STOP=new Set('a o as os um uma uns umas de da do das dos em na no nas nos ao aos e ou que qual quais como onde quando porque por para com sem se eu voce voces nosso nossa nossos nossas seu sua seus suas meu minha este esta isto esse essa isso aquele aquela algo foi e sao ser estar sera tem ter ha pode podem posso deve devem preciso precisa suficiente apenas so ja entao ate tambem antes depois mesmo mesma mesmos mesmas outro outra outros outras dois duas'.split(' '));
const normalized=text=>text.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu,'');
export function contentTerms(text,limit=24){const words=text.match(/[\p{L}\p{N}]+/gu)||[];const unique=new Map();for(const raw of words){const key=normalized(raw);if(key.length<3||STOP.has(key))continue;if(!unique.has(key))unique.set(key,raw.toLowerCase());if(unique.size===limit)break;}return [...unique.values()];}
function cosine(a,b){let dot=0,na=0,nb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return na&&nb?dot/Math.sqrt(na*nb):0;}
export async function semanticCoverage(query,evidence,embed,{termThreshold=0.4,minCoverage=0.6}={}){
 const terms=contentTerms(query);if(!terms.length)return {accepted:false,ratio:0,supported_terms:0,total_terms:0};
 const evidenceTerms=contentTerms(evidence,400);const documentVectors=[];
 for(const word of evidenceTerms){try{documentVectors.push(await embed(word));}catch{ /* Unknown evidence words do not provide support. */ }}
 let supported=0;const details=[];
 for(const term of terms){let best=0;try{const q=await embed(term);for(const vector of documentVectors)best=Math.max(best,cosine(q,vector));}catch{ /* Unknown query concepts remain in the denominator. */ }
  if(best>=termThreshold)supported++;details.push({term,similarity:Math.round(best*1000)/1000});
 }
 const ratio=supported/terms.length;return {accepted:ratio>=minCoverage,ratio,supported_terms:supported,total_terms:terms.length,term_threshold:termThreshold,required_coverage:minCoverage,details};
}
export async function filterSemanticCandidates(query,candidates,embed){
 const items=[],evaluations=[];let rejected_count=0;
 // Bound the request-local cache: it contains only temporary vectors of terms in this request.
 const cache=new Map();const cached=async word=>{if(cache.has(word))return cache.get(word);const vector=await embed(word);if(cache.size<2048)cache.set(word,vector);return vector;};
 for(const candidate of candidates){let best=null,fragment=null;
  for(const part of candidate.semantic_evidence||[]){const coverage=await semanticCoverage(query,part.content,cached);if(!best||coverage.ratio>best.ratio){best=coverage;fragment=part;}}
  evaluations.push({id:candidate.id,subject_key:candidate.subject_key,coverage:best});
  if(best?.accepted)items.push({...candidate,excerpt:fragment.content.slice(0,1200),semantic_coverage:best,evidence_position:fragment.position});else rejected_count++;
 }
 return {items,rejected_count,evaluations};
}
