from PIL import Image,ImageDraw
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'public'
for size in [180,192,512]:
 im=Image.new('RGB',(size,size),'#234f43');d=ImageDraw.Draw(im);s=size/192
 d.polygon([(int(x*s),int(y*s)) for x,y in [(40,48),(87,48),(96,58),(105,48),(152,48),(152,140),(105,140),(96,148),(87,140),(40,140)]],fill='#f4f2dd');d.line([(int(96*s),int(59*s)),(int(96*s),int(137*s))],fill='#234f43',width=max(2,int(5*s)))
 im.save(p/f'icon-{size}.png')
