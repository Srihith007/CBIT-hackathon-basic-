#!/usr/bin/env python3
"""Start local API and frontend independently of the invoking terminal session."""
import json, os, socket, subprocess, time, urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent
work=root.parent/'work'
runtime=work/'traceline-runtime';runtime.mkdir(parents=True,exist_ok=True)
env=os.environ.copy()
env['PATH']=str(work/'media-runtime/node_modules/@ffmpeg-installer/darwin-arm64')+os.pathsep+str(work/'media-runtime/node_modules/@ffprobe-installer/darwin-arm64')+os.pathsep+env['PATH']
env['MPLCONFIGDIR']=str(runtime/'matplotlib')
env['YOLO_CONFIG_DIR']=str(runtime/'ultralytics')
env['TRACELINE_API_URL']='http://127.0.0.1:8010'
def listening(port):
    with socket.socket() as s:return s.connect_ex(('127.0.0.1',port))==0
if not listening(55432):
    raise SystemExit('PostgreSQL is stopped. Run bash start-local.sh first.')
pids={}
for name,port,cwd,cmd in [('backend',8010,root/'backend',[str(root/'backend/.venv/bin/python'),'-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8010']),('frontend',5176,root/'frontend',['npm','run','dev','--','--host','127.0.0.1','--port','5176','--strictPort'])]:
    if listening(port):
        print(name+': already listening on '+str(port));continue
    with (runtime/(name+'.log')).open('ab') as log:
        p=subprocess.Popen(cmd,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,close_fds=True)
    pids[name]=p.pid
    print(name+' started: '+str(p.pid))
(runtime/'pids.json').write_text(json.dumps(pids))
for name,url in [('backend','http://127.0.0.1:8010/api/v1/health'),('frontend proxy','http://127.0.0.1:5176/api/v1/health')]:
    for attempt in range(30):
        try:
            with urllib.request.urlopen(url,timeout=2) as r: health=json.load(r)
            if not health.get('database',{}).get('ok'):raise RuntimeError('database unavailable')
            print(name+': healthy');break
        except Exception:
            if attempt==29:raise SystemExit(name+' did not become healthy; inspect work/traceline-runtime logs')
            time.sleep(.5)
print('Open http://127.0.0.1:5176/')
