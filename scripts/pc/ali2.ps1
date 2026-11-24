# MM - abre cada produto do AliExpress no Chrome invisivel do PC (max 45 s por pagina) e confere os dados
param([string[]]$Urls)
$Urls = @($Urls | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_ })
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
Remove-Item C:\Temp\mm\dom_*.html -ErrorAction SilentlyContinue
foreach ($u in $Urls) {
  $f = "C:\Temp\mm\dom_" + ($u -replace '\D','').Substring(0,16) + ".html"
  $cargs = @('--headless=new','--disable-gpu','--virtual-time-budget=15000','--user-data-dir=C:\Temp\mm\chrome-perfil','--dump-dom',$u)
  $p = Start-Process -FilePath $chrome -ArgumentList $cargs -RedirectStandardOutput $f -RedirectStandardError "C:\Temp\mm\chrome_err.txt" -WindowStyle Hidden -PassThru
  if (-not $p.WaitForExit(45000)) { try { $p.Kill($true) } catch { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }; Add-Content C:\Temp\mm\ali_log.txt "$(Get-Date -f s) tempo esgotado $u" }
  Start-Sleep -Seconds 3
}
# le os HTML baixados e grava C:\Temp\mm\ali_out2.json
& powershell -ExecutionPolicy Bypass -File C:\Temp\mm\ler_dom.ps1
