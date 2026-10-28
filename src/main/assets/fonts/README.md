# PDF fonts

`Cairo-Regular.ttf` and `Cairo-Bold.ttf` are the Cairo font the interface uses
(`src/renderer/assets/fonts`, Google Fonts, cairo v30, Arabic + Latin subset), converted from
woff2 to TTF for the PDF exports: pdfmake does not render woff2. exportManager.js loads them.

Cairo is licensed under the SIL Open Font License 1.1 (https://openfontlicense.org);
Copyright 2009 The Cairo Project Authors (https://github.com/Gue3bara/Cairo).
