import csv,json,pathlib,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
shards={}; count=0
with (root/'data/ecdict.csv').open() as f:
 for row in csv.DictReader(f):
  w=row['word'].lower()
  if not w.isascii() or not w.replace("'",'').replace('-','').isalpha() or len(w)<2: continue
  if not row['translation']:continue
  shards.setdefault(w[:2],{})[w]={'word':w,'ipa':row['phonetic'],'translation':row['translation'],'definition':row['definition'],'exchange':row['exchange']};count+=1
for key,data in shards.items():
 (root/'public/dict'/f'{key}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
(root/'public/dict/SOURCE.json').write_text(json.dumps({'source':'https://github.com/skywind3000/ECDICT','license':'MIT','sha256':hashlib.sha256((root/'data/ecdict.csv').read_bytes()).hexdigest(),'entries':count},indent=2))
for word in ['study','book','run','right','mean','frief']:
 print(word,shards.get(word[:2],{}).get(word))
# 仅用词库明确的词形关联，存在多个原形的词不自动关联。
forms={}
for shard in list(shards.values()):
 for w,row in list(shard.items()):
  for item in row['exchange'].split('/'):
   if ':' not in item:continue
   tag,form=item.split(':',1)
   if tag in ['s','3','d','p','i','r','t'] and form!=w and form.isascii() and form.isalpha():forms.setdefault(form,set()).add(w)
for form,bases in forms.items():
 if len(bases)!=1:continue
 base=next(iter(bases)); row=shards.get(form[:2],{}).get(form)
 if row:row['lemma']=base
 else:
  source=shards[base[:2]][base]
  shards.setdefault(form[:2],{})[form]={**source,'lemma':base,'isForm':True}
for key,data in shards.items():
 (root/'public/dict'/f'{key}.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
