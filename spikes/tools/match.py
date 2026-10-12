import json,re,sys
log=[json.loads(l) for l in open('/tmp/atc-probe/log.jsonl')]
md={d['requestId']:d['text'] for d in log if d['kind'] in('AssistantMessage','UserMessage')}
sels=[d['sel'] for d in log if d['kind']=='sel-change' and d['sel']]
MARK=re.compile('[⁽⁾⁰¹²³⁴⁵⁶⁷⁸⁹①-⑳]')
def project(s):
    # markdown -> (plain, map plain index -> md index)
    out=[];m=[];i=0
    while i<len(s):
        lk=re.match(r'\[([^\]]*)\]\([^)]*\)',s[i:])
        if lk:
            for j,c in enumerate(lk.group(1)): out.append(c);m.append(i+1+j)
            i+=lk.end();continue
        if s[i] in '`*_~' and not (s[i]=='_' and i>0 and s[i-1].isalnum() and i+1<len(s) and s[i+1].isalnum()):
            i+=1;continue
        out.append(s[i]);m.append(i);i+=1
    return ''.join(out),m
def ws(x): return re.sub(r'\s+',' ',x).strip()
for s in sels:
    t=MARK.sub('',s['text']); src=md.get(s.get('requestId'),'')
    naive= t in src
    p,m=project(src)
    # whitespace-insensitive search
    pat=r'\s+'.join(map(re.escape,t.split()))
    r=re.search(pat,p)
    print(f"naive={'Y' if naive else 'n'} proj={'Y' if r else 'n'}  {t[:60]!r}")
