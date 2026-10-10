// Canonical display contract: formulas belong ONLY in row 2 (A2:O2).
// Never insert/move rows in the display sheet; append data to source Bridge/GBP tabs.
// Bound destination spill to 500 rows so a misplaced anchor cannot exhaust the 50k-row sheet.
export function imageSheetViewFormulas() {
  const bridge="'25_WEB_PUBLISH_BRIDGE'!", gbp="'22_GBP_POST'!";
  const viewIds="$C$2:$C$501";
  const dateKey=`IFERROR(VALUE(REGEXEXTRACT(${bridge}C2:C,"BLOG-([0-9]{8})")),IFERROR(VALUE(TEXT(${bridge}A2:A,"yyyymmdd")),0))`;
  const lookup=col=>`ARRAYFORMULA(XLOOKUP(${viewIds},${bridge}$C$2:$C,${bridge}${col}$2:${col},"",0,-1))`;
  // A stale retry row can share the parent ID but have no assets. Join the
  // latest asset-bearing row, keeping path/status/QA from that same row.
  const glookup=col=>`MAP(${viewIds},LAMBDA(id,IF(id="","",IFNA(INDEX(SORT(FILTER({ROW(${gbp}$D$2:$D),${gbp}${col}$2:${col}},${gbp}$D$2:$D=id,${gbp}$M$2:$M<>""),1,FALSE),1,2),""))))`;
  const url='IF(LEFT(p,4)="http",p,"https://therev-lab.com"&p)';
  const mapped=(expr,fn)=>`=MAP(${expr},LAMBDA(p,IF(p="","",${fn})))`;
  return [
    `=ARRAYFORMULA(IF(${viewIds}="","",${lookup('A')}))`,
    `=ARRAYFORMULA(IF(${viewIds}="","",${lookup('I')}))`,
    // SORTN display_ties_mode=2 removes duplicate content IDs; timestamp ties
    // resolve by newest physical Bridge row. Open-ended ranges follow appends.
    `=IFNA(CHOOSECOLS(SORT(SORTN(SORT(FILTER({${dateKey},${bridge}C2:C,ROW(${bridge}C2:C)},${bridge}C2:C<>""),1,FALSE,3,FALSE),9^9,2,2,TRUE),1,FALSE,3,FALSE),2),"")`,
    `=ARRAYFORMULA(IF(${viewIds}="","",IF(${lookup('Q')}<>"",${lookup('Q')},${lookup('D')})))`,
    `=MAP(${lookup('R')},$D$2:$D$501,LAMBDA(p,s,IF(AND(p<>"",OR(s="READY",s="PUBLISHED")),IMAGE(${url},4,96,171),"")))`,
    `=MAP(${lookup('R')},$D$2:$D$501,LAMBDA(p,s,IF(p="","",IF(OR(s="READY",s="PUBLISHED"),HYPERLINK(${url},"完成画像"),"画像確認中"))))`,
    `=MAP(${lookup('S')},$D$2:$D$501,LAMBDA(p,s,IF(p="","",IF(OR(s="READY",s="PUBLISHED"),HYPERLINK(${url},"OGP (1200×630)"),"OGP確認中"))))`,
    `=MAP(${lookup('F')},${lookup('N')},LAMBDA(r,p,IF(p<>"",HYPERLINK(p,"公開記事"),IF(r<>"",HYPERLINK(r,"Review"),""))))`,
    `=ARRAYFORMULA(IF($C$2:$C="","",${lookup('Z')}))`,
    mapped(lookup('N'),'HYPERLINK(p,"公開記事")'),
    mapped(lookup('F'),'HYPERLINK(p,"Review")'),
    mapped(glookup('M'),`IMAGE(${url},4,112,149)`),
    mapped(glookup('M'),`HYPERLINK(${url},"GBP 4:3 / 1200×900")`),
    `=MAP(${viewIds},${glookup('M')},${glookup('L')},${glookup('O')},LAMBDA(id,p,s,n,IF(id="","",IF(p="","未生成",IF(REGEXMATCH(TO_TEXT(n),"4:3|1200[x×]900"),s&" / 4:3","CHECK_RATIO")))))`,
    `=MAP(${viewIds},$D$2:$D$501,$N$2:$N$501,LAMBDA(id,w,g,IF(id="","",IF(OR(w="PREPARING",w="IMAGE_PREPARING"),"要対応：Web画像が未完了",IF(w="READY",IF(LEFT(TO_TEXT(g),5)="READY","Web/GBPの画像情報あり","Web画像情報あり・GBP未生成"),IF(w="PUBLISHED","過去記事：画像リンクを確認","要確認："&w))))))`
  ];
}

export function googleBusinessSheetViewFormulas() {
  const g="'22_GBP_POST'!";
  const stamp=`IFERROR(VALUE(SUBSTITUTE(TO_TEXT(${g}A2:A),",","")),0)`;
  const postState=`IF(${g}P2:P<>"",${g}P2:P,IF(${g}I2:I="[BLOG_URL]","BLOCKED_URL",${g}J2:J))`;
  const table=`{${stamp},IFERROR(TEXT(${g}A2:A,"yyyy/mm/dd hh:mm"),TO_TEXT(${g}A2:A)),${g}E2:E,${g}F2:F,${g}G2:G,${g}H2:H,${g}I2:I,${postState},IF(${g}L2:L="READY","準備完了",${g}L2:L),${g}M2:M,${g}K2:K,${g}D2:D}`;
  return [
    `=ARRAYFORMULA(IFNA(CHOOSECOLS(SORT(SORTN(SORT(FILTER(${table},${g}E2:E<>""),1,FALSE),9^9,2,12,TRUE),1,FALSE),2,3,4,5,6,7,8,9,10,11,12),""))`,
    '=MAP(I2:I,LAMBDA(p,IF(p="","",HYPERLINK(IF(LEFT(p,4)="http",p,"https://therev-lab.com"&p),"GBP画像を開く"))))'
  ];
}
