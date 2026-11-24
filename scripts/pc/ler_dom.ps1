# MM - le os HTML ja baixados (dom_*.html) e extrai os dados conferidos
function C($h, $pats) { foreach ($p in $pats) { $m = [regex]::Match($h, $p); if ($m.Success) { return ([System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)).Trim() } }; return $null }
$out = foreach ($f in Get-ChildItem C:\Temp\mm\dom_*.html) {
  $h = Get-Content -Raw -Encoding utf8 $f.FullName
  [pscustomobject]@{
    item = ($f.BaseName -replace 'dom_','')
    url = "https://www.aliexpress.us/item/" + ($f.BaseName -replace 'dom_','') + ".html"
    tamanho = $f.Length
    bloqueado = [bool]($h -match 'punish|slide to verify|baxia-dialog')
    titulo = C $h @('<h1[^>]*data-pl="product-title"[^>]*>([^<]+)<','og:title" content="([^"]+)"')
    foto = C $h @('og:image" content="([^"]+)"','magnifier--image[^"]*" src="([^"]+)"')
    preco = C $h @('price-default--current[^"]*"[^>]*>([^<]+)<')
    preco_cheio = C $h @('price-default--original[^"]*"[^>]*><bdi>([^<]+)<')
    nota = C $h @('reviewer--rating[^"]*"[^>]*>(?:<[^>]+>)*\s*([0-9][.,][0-9])','<strong>([0-9][.,][0-9])</strong>')
    avaliacoes = C $h @('([0-9.,]+)\s*(?:Reviews|avalia[cç][oõ]es)')
    vendidos = C $h @('reviewer--sold[^"]*"[^>]*>([^<]+)<')
    loja = C $h @('store-header--storeName[^"]*"[^>]*>([^<]+)<','store-detail--storeName[^"]*"[^>]*>([^<]+)<')
  }
}
$out | ConvertTo-Json | Out-File -Encoding utf8 C:\Temp\mm\ali_out2.json
"FIM"
