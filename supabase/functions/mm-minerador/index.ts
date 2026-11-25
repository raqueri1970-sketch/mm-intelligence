// MM · Minerador ShopPainless v1 — ranking diário de produtos para testar.
// Custo zero: roda no Supabase (pg_cron -> esta função), sem PC e sem chave paga.
// Regra das 2 fontes: Meta Ad Library (anúncios reais coletados pelo MM) + página real da loja
// (products.json da Shopify, baixada na hora pelo banco via pg_net). Google Trends entra como 3ª fonte de reforço.
// Só vai como aprovado o que tiver confiança ALTA ou MÉDIA. Link só aparece como verificado se abriu agora.
import postgres from "npm:postgres@3.4.3";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });
const H = { "Content-Type": "application/json" };
const VERSAO = "v1.4";
const CANDIDATOS = 150;
const MXN_USD = 18.5; // aproximado, só para a faixa de preço
const PRECO_MIN_USD = 15, PRECO_MAX_USD = 100, IDEAL_MIN = 25, IDEAL_MAX = 75;

const DOMINIO_BLOQ = /(whatsapp|wa\.me|facebook|instagram|fb\.me|fb\.com|linktr|bit\.ly|google\.|youtube|tiktok\.com|amazon\.|walmart\.|etsy\.|ebay\.|mercadolibre|temu\.|shein\.)/i;
const TITULO_BLOQ = /(chatea|whatsapp|appointment|consulta|clinic|cl[ií]nica|book now|agenda|webinar|course|curso|ebook|e-book|free trial|subscription|suscripci|supplement|suplemento|capsul|c[aá]psula|gummies|gomitas|vitamin|tablets|pastillas|laser facial|\(\$\d+ value\))/i;
// Regra do Ricardo (25/11/2026): SÓ saúde e beleza. Roupa, calçado, artigo esportivo e roupa de cama ficam de fora.
const ROUPA = /\b(leggings?|calzas?|mallas?|pants|jeans|shorts?|skirts?|faldas?|dress(es)?|vestidos?|bras?|bralettes?|sujetador(es)?|brassiere|lingerie|underwear|panties|calz[oó]n(es)?|bodysuits?|shapewear|fajas?|corsets?|cors[eé]s?|shirts?|t-shirts?|tees?|camisas?|camisetas?|blusas?|hoodies?|sudaderas?|jackets?|chaquetas?|chamarras?|sweaters?|su[eé]teres?|cardigans?|swimsuits?|swimwear|bikinis?|ba[nñ]adores?|pajamas?|pijamas?|robes?|socks?|calcetines|sneakers?|shoes?|zapatos?|tenis|sandals?|sandalias|boots?|botas|slippers?|pantuflas|jerseys?|uniforms?|futbol|f[uú]tbol|soccer|football|bed ?sheets?|fitted sheets?|duvets?|comforters?|edred[oó]n(es)?|s[aá]banas)\b/i;
const DOMINIO_ROUPA = /(futbol|soccer|football|apparel|clothing|wear\.|shoes|legging|lingerie|swim)/i;
const STOP = new Set("the and for with your you this that from best new our are not all get one use how why what before after more less buy now off free shop sale only just los las del para con por una que sus mas más the una tu".split(" "));

type Cand = Record<string, any>;
const tokens = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
function jaccard(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0;
  let i = 0; for (const x of A) if (B.has(x)) i++;
  return i / Math.min(A.size, B.size);
}
const falhas: Record<string, string> = {};
// As lojas Shopify bloqueiam (HTTP 429) o IP compartilhado das Edge Functions. Por isso as páginas são
// baixadas pelo próprio banco (pg_net), que sai por outro IP: enfileira tudo, espera as respostas e lê.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const respostas = new Map<string, any>();
// Etapa 1 ("fila"): pede as páginas ao pg_net e guarda os ids. Etapa 2 ("ranking", minutos depois): lê as respostas.
// Precisa ser em 2 chamadas: enquanto esta função roda, a própria chamada dela ocupa o lote do pg_net.
async function enfileirar(urls: string[]) {
  await sql`delete from public.mm_minerador_fetch where run_date = current_date`;
  for (let i = 0; i < urls.length; i += 50) {
    const lote = urls.slice(i, i + 50);
    await sql`insert into public.mm_minerador_fetch (url, req_id)
      select u.url, net.http_get(u.url, headers := jsonb_build_object('User-Agent', ${UA}::text, 'Accept', 'application/json'), timeout_milliseconds := 20000)
      from unnest(${lote}::text[]) u(url)`;
  }
  return urls.length;
}
async function lerRespostas() {
  const rs = await sql`select f.url, r.status_code, r.timed_out, r.error_msg, case when r.status_code = 200 then public.mm_minerador_slim(r.content) end j
    from public.mm_minerador_fetch f left join net._http_response r on r.id = f.req_id where f.run_date = current_date`;
  let pendentes = 0;
  for (const x of rs) {
    if (x.status_code === 200) { if (x.j) respostas.set(x.url, x.j); else falhas[x.url] = "não é JSON"; }
    else if (x.status_code) falhas[x.url] = `HTTP ${x.status_code}`;
    else if (x.timed_out || x.error_msg) falhas[x.url] = x.timed_out ? "tempo esgotado" : String(x.error_msg).slice(0, 60);
    else { falhas[x.url] = "sem resposta ainda"; pendentes++; }
  }
  return { total: rs.length, pendentes };
}
function getJson(url: string) { return respostas.get(url) ?? null; }
const urlCatalogo = (host: string) => `https://${host}/products.json?limit=250`;
function hosts(dominio: string, link: string) {
  const out: string[] = [];
  try { if (link) out.push(new URL(link).hostname); } catch { /* */ }
  if (dominio) out.push(dominio);
  for (const h of [...out]) { const p = h.split("."); if (p.length > 2) out.push(p.slice(-2).join(".")); if (p.length > 3) out.push(p.slice(-3).join(".")); }
  return [...new Set(out.map((h) => h.replace(/^www\./, "")).filter(Boolean))];
}
function handleDoLink(link: string) { const m = (link || "").match(/\/products\/([a-z0-9\-_%.]+)/i); return m ? decodeURIComponent(m[1]).replace(/\.js$/, "") : null; }

function urlsDe(c: Cand) {
  const handle = handleDoLink(c.link);
  return hosts(c.dominio, c.link).flatMap((h) => handle ? [`https://${h}/products/${handle}.js`, urlCatalogo(h)] : [urlCatalogo(h)]);
}
function checarLoja(c: Cand) {
  const handle = handleDoLink(c.link);
  for (const host of hosts(c.dominio, c.link)) {
    if (handle) {
      const p = getJson(`https://${host}/products/${handle}.js`);
      if (p && p.title) return { host, loja_ok: true, total: null, prod: { title: p.title, handle: p.handle || handle, price: Number(p.price) / 100, image: p.featured_image ? (String(p.featured_image).startsWith("//") ? "https:" + p.featured_image : p.featured_image) : null, available: !!p.available, created_at: p.created_at }, metodo: "link do anúncio" };
    }
    const j = getJson(urlCatalogo(host));
    if (!j || !Array.isArray(j.products)) continue;
    const prods = j.products.filter((p: any) => p && p.title);
    if (!prods.length) return { host, loja_ok: true, total: 0, prod: null, metodo: "loja sem produtos" };
    const alvo = tokens(`${c.titulo} ${(c.texto || "").slice(0, 160)}`);
    let best: any = null, bestS = 0;
    for (const p of prods) { const s = jaccard(tokens(p.title), alvo); if (s > bestS) { bestS = s; best = p; } }
    let metodo = `nome parecido (${Math.round(bestS * 100)}%)`;
    if (bestS < 0.5) {
      if (prods.length <= 5) { best = prods[0]; metodo = "loja de 1 produto"; } else best = null;
    }
    const conv = (p: any) => {
      const vs = (p.variants || []).map((v: any) => ({ price: Number(v.price), av: v.available !== false })).filter((v: any) => v.price > 0);
      const price = vs.length ? Math.min(...vs.map((v: any) => v.price)) : null;
      return { title: p.title, handle: p.handle, price, image: p.images?.[0]?.src || null, available: vs.some((v: any) => v.av), created_at: p.created_at };
    };
    return { host, loja_ok: true, total: prods.length, prod: best ? conv(best) : null, metodo: best ? metodo : "produto não achado na loja" };
  }
  const hs = hosts(c.dominio, c.link); const erro = hs.map((h) => falhas[urlCatalogo(h)]).filter(Boolean)[0] || "sem resposta";
  return { host: null, loja_ok: false, total: null, prod: null, metodo: `loja não abriu / não é Shopify (${erro})` };
}

function trendsDe(c: Cand, sinais: any[]) {
  const alvo = new Set(tokens(`${c.titulo} ${(c.texto || "").slice(0, 200)} ${(c.palavras || []).join(" ")}`));
  let best: any = null;
  for (const s of sinais) {
    if (s.geo && c.pais && s.geo !== c.pais) continue;
    const t = tokens(s.termo); if (!t.length) continue;
    const hit = t.filter((w) => alvo.has(w)).length;
    if (hit < Math.min(2, t.length)) continue;
    if (!best || (s.growth ?? -1e9) > (best.growth ?? -1e9)) best = { ...s, hit };
  }
  return best;
}

async function rodar(acao: string, dataBase?: string) {
  respostas.clear(); for (const k of Object.keys(falhas)) delete falhas[k];
  const d = dataBase || (await sql`select max(data)::text d from public.mm_meta_vencedores`)[0].d;
  const cands: Cand[] = await sql`select * from public.mm_meta_vencedores where data = ${d} order by nota desc limit ${CANDIDATOS}`;
  const sinais = (await sql`select produto_nome_bruto termo, sinal->>'geo' geo, (sinal->>'growth_pct')::numeric growth, (sinal->>'latest_interest')::numeric atual, sinal->>'source' fonte, coletado_em
     from public.collector_signals where coletor = 'google_trends' and coletado_em > now() - interval '7 days'`).map((r: any) => ({ ...r, growth: r.growth == null ? null : Number(r.growth) }));
  const metaIdadeDias = Math.round((Date.now() - new Date(d + "T00:00:00Z").getTime()) / 864e5);

  const vistos = new Set<string>(); const fila: Cand[] = []; let bloqueados = 0; let roupa = 0;
  for (const c of cands) {
    const k = `${c.pais}|${(c.dominio || "").toLowerCase()}|${tokens(c.titulo).slice(0, 4).join(" ")}`;
    if (vistos.has(k)) continue; vistos.add(k);
    if (!c.dominio || DOMINIO_BLOQ.test(c.dominio) || TITULO_BLOQ.test(`${c.titulo} ${(c.texto || "").slice(0, 120)}`)) { bloqueados++; continue; }
    if (ROUPA.test(`${c.titulo || ""} ${(c.texto || "").slice(0, 120)}`) || DOMINIO_ROUPA.test(c.dominio || "")) { roupa++; continue; }
    fila.push(c);
  }
  const urls = [...new Set(fila.flatMap(urlsDe))];
  if (acao === "fila") return { versao: VERSAO, etapa: "fila", base_meta: d, urls: await enfileirar(urls) };
  let leitura = await lerRespostas();
  if (!leitura.total) { await enfileirar(urls); return { versao: VERSAO, etapa: "fila", aviso: "fila criada agora; rode o ranking daqui a 5 minutos" }; }
  const lojas: any[] = fila.map(checarLoja);

  const linhas: any[] = [];
  fila.forEach((c, i) => {
    const L = lojas[i]; const P = L.prod;
    if (P && ROUPA.test(P.title || "")) { roupa++; return; } const motivos: string[] = []; const fontes: any[] = [];
    const cresc = Number(c.sinais?.cresc_anunciante_pct ?? 0);
    fontes.push({ fonte: "Meta Ad Library (coleta MM)", base: d, idade_dias: metaIdadeDias, anuncios: c.n_ads, dias_no_ar: c.dias_max, maior_anunciante: c.maior_anunciante });
    const moeda = c.pais === "MX" ? "MXN" : "USD";
    const preco = P?.price ?? (c.preco != null ? Number(c.preco) : null);
    const precoUsd = preco == null ? null : Math.round((moeda === "MXN" ? preco / MXN_USD : preco) * 100) / 100;
    if (L.loja_ok) fontes.push({ fonte: "Página da loja (aberta agora)", host: L.host, produtos_na_loja: L.total, achado: L.metodo, produto: P?.title || null, preco: P?.price ?? null, disponivel: P?.available ?? null });
    const tr = trendsDe(c, sinais);
    if (tr) fontes.push({ fonte: "Google Trends", termo: tr.termo, geo: tr.geo, crescimento_pct: tr.growth, interesse_atual: tr.atual, coletado_em: tr.coletado_em });

    let score = Number(c.nota || 0) * 0.55 + Math.min(Number(c.dias_max || 0), 90) / 90 * 15 + Math.max(0, Math.min(cresc, 100)) / 100 * 5;
    if (P) score += 15; else if (L.loja_ok) score += 6;
    if (tr && (tr.growth ?? 0) > 10) score += 10; else if (tr) score += 4;
    if (precoUsd != null && precoUsd >= IDEAL_MIN && precoUsd <= IDEAL_MAX) score += 5;
    score = Math.min(100, Math.round(score * 10) / 10);

    const precoOk = precoUsd != null && precoUsd >= PRECO_MIN_USD && precoUsd <= PRECO_MAX_USD;
    if (!L.loja_ok) motivos.push(L.metodo);
    else if (!P) motivos.push("loja abre, mas o produto do anúncio não foi achado nela");
    if (P && P.available === false) motivos.push("produto esgotado na loja");
    if (precoUsd == null) motivos.push("preço não confirmado");
    else if (!precoOk) motivos.push(`preço fora da faixa ($${precoUsd})`);
    if (Number(c.dias_max || 0) < 14) motivos.push("anúncio com menos de 14 dias no ar");
    if (metaIdadeDias > 7) motivos.push(`base do Meta com ${metaIdadeDias} dias (vale só com 2ª fonte)`);

    const fontesFortes = (L.loja_ok && P ? 1 : 0) + 1; // Meta + loja com o produto
    let conf: "ALTA" | "MEDIA" | "BAIXA" = "BAIXA";
    if (P && P.available !== false && precoOk && Number(c.dias_max) >= 30 && Number(c.n_ads) >= 3 && metaIdadeDias <= 7) conf = "ALTA";
    else if (P && P.available !== false && precoOk && Number(c.dias_max) >= 14) conf = "MEDIA";
    const linkLoja = P && L.host && P.handle ? `https://${L.host}/products/${P.handle}` : null;
    linhas.push({
      base_meta: d, pais: c.pais, produto: P?.title || c.titulo || (c.texto || "").slice(0, 80) || `Anúncio de ${c.dominio}`, loja: L.host || c.dominio,
      link_produto: linkLoja || c.link || null, link_verificado: !!linkLoja, imagem: P?.image || c.imagem || null,
      preco, moeda, preco_usd: precoUsd, n_ads: c.n_ads, dias_no_ar: c.dias_max, cresc_anunciante_pct: cresc,
      trends: tr ? sql.json({ termo: tr.termo, geo: tr.geo, crescimento_pct: tr.growth, interesse_atual: tr.atual }) : null,
      fontes: sql.json(fontes), n_fontes: fontesFortes + (tr ? 1 : 0), score, confianca: conf,
      aprovado: conf !== "BAIXA", motivos: sql.json(motivos),
    });
  });
  // dedupe final (mesmo produto da mesma loja)
  const uniq = [...new Map(linhas.sort((a, b) => b.score - a.score).map((x) => [`${x.pais}|${x.loja}|${x.produto}`, x])).values()];
  uniq.sort((a, b) => Number(b.aprovado) - Number(a.aprovado) || b.score - a.score).forEach((x, i) => (x.posicao = i + 1));
  await sql.begin(async (t: any) => {
    await t`delete from public.mm_minerador_ranking where run_date = current_date`;
    if (uniq.length) await t`insert into public.mm_minerador_ranking ${t(uniq, "base_meta","posicao","pais","produto","loja","link_produto","link_verificado","imagem","preco","moeda","preco_usd","n_ads","dias_no_ar","cresc_anunciante_pct","trends","fontes","n_fontes","score","confianca","aprovado","motivos")}`;
  });
  const cont = { versao: VERSAO, base_meta: d, paginas: leitura.total, sem_resposta: leitura.pendentes, candidatos: cands.length, bloqueados, roupa_fora: roupa, analisados: fila.length, lojas_ok: lojas.filter((l) => l.loja_ok).length,
    produto_confirmado: lojas.filter((l) => l.prod).length, alta: uniq.filter((x) => x.confianca === "ALTA").length, media: uniq.filter((x) => x.confianca === "MEDIA").length };
  const aviso = [metaIdadeDias > 2 ? `ATENÇÃO: base do Meta é de ${d} (${metaIdadeDias} dias)` : "", leitura.pendentes > leitura.total * 0.2 ? `ATENÇÃO: ${leitura.pendentes} de ${leitura.total} páginas sem resposta` : ""].filter(Boolean).join(" | ");
  await sql`insert into public.mm_minerador_runs (ok, mensagem, contagem) values (${true}, ${aviso || "ok"}, ${sql.json(cont)})`;
  return { ...cont, aviso };
}

Deno.serve(async (req) => {
  try {
    const s = (await sql`select decrypted_secret from vault.decrypted_secrets where name = 'mm_cron_secret'`)[0]?.decrypted_secret || "";
    if (!s || req.headers.get("x-mm-cron") !== s) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: H });
    const b = await req.json().catch(() => ({}));
    return new Response(JSON.stringify({ ok: true, ...(await rodar(String(b.acao || "ranking"), b.data)) }), { headers: H });
  } catch (e) {
    console.error(e);
    await sql`insert into public.mm_minerador_runs (ok, mensagem) values (false, ${String((e as Error)?.message || e)})`.catch(() => {});
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: H });
  }
});
