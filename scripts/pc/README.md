# Scripts que rodam no PC do Ricardo (D-90-001167, pasta C:\Temp\mm)

Usados pela tarefa diária das 10h (Desktop Commander). O PC sai pela internet de casa, então o AliExpress
não bloqueia como bloqueia a nuvem.

- `ali2.ps1 -Urls "url1 url2"`: abre cada produto do AliExpress no Chrome invisível (`--headless=new --dump-dom`)
  e grava `C:\Temp\mm\dom_<item>.html`.
- `ler_dom.ps1`: lê esses HTML e grava `C:\Temp\mm\ali_out2.json` (título, foto, preço, preço cheio, nota, vendidos, loja).

Observações conferidas em 24/11/2026: Python `urllib` cai em loop de redirect (falta cookie). O PowerShell sem
Chrome traz título e foto, mas não preço. Com o Chrome invisível vem tudo, em R$ porque o PC está no Brasil.
Algumas páginas ainda vêm com captcha: o script marca `bloqueado=true` e o item não entra.
