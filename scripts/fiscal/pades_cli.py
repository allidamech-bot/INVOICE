"""Private local IPC bridge; no HTTP route, private key, or authority request."""
import base64
import json
import sys
from datetime import datetime
from pades_fiscal import prepare_managed, finish_managed

CAP=48*1024*1024

def decode(s,limit):
    if not isinstance(s,str) or len(s)>4*((limit+2)//3): raise ValueError('IPC_SIZE')
    value=base64.b64decode(s,validate=True)
    if not 1<=len(value)<=limit or base64.b64encode(value).decode()!=s: raise ValueError('IPC_ENCODING')
    return value

def encode(value): return base64.b64encode(value).decode('ascii')

def run(op,d):
    common={'xml','certs','at','validator'}
    expected=common|({'manifest','issuerVat'} if op=='prepare' else {'staged','originalSize','evidence','signature'})
    if set(d)!=expected or op not in ('prepare','finish') or not isinstance(d['certs'],list) or not 2<=len(d['certs'])<=8: raise ValueError('IPC_FIELDS')
    xml=decode(d['xml'],512*1024); certs=[decode(c,32768) for c in d['certs']]; at=datetime.fromisoformat(d['at'].replace('Z','+00:00'))
    if op=='prepare':
        staged,attrs,size,evidence=prepare_managed(xml,d['manifest'],certs,at,d['validator'],d['issuerVat'])
        return {'staged':encode(staged),'attrs':encode(attrs),'originalSize':size,'evidence':evidence}
    pdf,evidence=finish_managed(decode(d['staged'],32*1024*1024),xml,certs,at,d['originalSize'],d['evidence'],decode(d['signature'],64),d['validator'])
    return {'pdf':encode(pdf),'evidence':evidence}

if __name__=='__main__':
    try:
        data=sys.stdin.buffer.read(CAP+1)
        if len(sys.argv)!=2 or len(data)>CAP: raise ValueError('IPC_SIZE')
        output=json.dumps(run(sys.argv[1],json.loads(data)),separators=(',',':')).encode()
        if len(output)>CAP: raise ValueError('IPC_SIZE')
        sys.stdout.buffer.write(output)
    except Exception:
        sys.stderr.write('FISCAL_PADES_PIPELINE_FAILED\n');sys.exit(1)
