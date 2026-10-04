// One spill per column; no fixed Bridge row or formula-copy dependency.
export function imageSheetViewFormulas() {
  const bridge="'25_WEB_PUBLISH_BRIDGE'!", gbp="'22_GBP_POST'!";
  const dateKey=`IFERROR(VALUE(REGEXEXTRACT(${bridge}C2:C,"BLOG-([0-9]{8})")),IFERROR(VALUE(TEXT(${bridge}A2:A,"yyyymmdd")),0))`;
  const lookup=col=>`ARRAYFORMULA(XLOOKUP($C$2:$C,${bridge}$C$2:$C,${bridge}${col}$2:${col},"",0,-1))`;
  // A stale retry row can share the parent ID but have no assets. Join the
  // latest asset-bearing row, keeping path/status/QA from that same row.
  const glookup=col=>`MAP($C$2:$C,LAMBDA(id,IF(id="","",IFNA(INDEX(SORT(FILTER({ROW(${gbp}$D$2:$D),${gbp}${col}$2:${col}},${gbp}$D$2:$D=id,${gbp}$M$2:$M<>""),1,FALSE),1,2),""))))`;
  const url='IF(LEFT(p,4)="http",p,"https://therev-lab.com"&p)';
  const mapped=(expr,fn)=>`=MAP(${expr},LAMBDA(p,IF(p="","",${fn})))`;
  return [
    `=ARRAYFORMULA(IF($C$2:$C="","",${lookup('A')}))`,
    `=ARRAYFORMULA(IF($C$2:$C="","",${lookup('I')}))`,
    // SORTN display_ties_mode=2 removes duplicate content IDs; timestamp ties
    // resolve by newest physical Bridge row. Open-ended ranges follow appends.
    `=IFNA(CHOOSECOLS(SORT(SORTN(SORT(FILTER({${dateKey},${bridge}C2:C,ROW(${bridge}C2:C)},${bridge}C2:C<>""),1,FALSE,3,FALSE),9^9,2,2,TRUE),1,FALSE,3,FALSE),2),"")`,
    `=ARRAYFORMULA(IF($C$2:$C="","",IF(${lookup('Q')}<>"",${lookup('Q')},${lookup('D')})))`,
    mapped(lookup('R'),`IMAGE(${url},4,120,213)`),
    mapped(lookup('R'),`HYPERLINK(${url},"完成画像")`),
    mapped(lookup('S'),`HYPERLINK(${url},"OGP")`),
    `=MAP(${lookup('F')},${lookup('N')},LAMBDA(r,p,IF(p<>"",HYPERLINK(p,"公開記事"),IF(r<>"",HYPERLINK(r,"Review"),""))))`,
    `=ARRAYFORMULA(IF($C$2:$C="","",${lookup('Z')}))`,
    mapped(lookup('N'),'HYPERLINK(p,"公開記事")'),
    mapped(lookup('F'),'HYPERLINK(p,"Review")'),
    mapped(glookup('M'),`IMAGE(${url},4,160,213)`),
    mapped(glookup('M'),`HYPERLINK(${url},"GBP 4:3 / 1200×900")`),
    `=MAP($C$2:$C,${glookup('M')},${glookup('L')},${glookup('O')},LAMBDA(id,p,s,n,IF(id="","",IF(p="","未生成",IF(REGEXMATCH(TO_TEXT(n),"4:3|1200[x×]900"),s&" / 4:3","CHECK_RATIO")))))`
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
