#!/usr/bin/env python3
"""Validate lesson contracts, render a local prototype and inspect prerequisites."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def validate(lesson):
    from jsonschema import Draft202012Validator
    schema = json.loads((ROOT/'schemas/lesson.schema.json').read_text(encoding='utf-8'))
    errors = sorted(Draft202012Validator(schema).iter_errors(lesson), key=lambda e: str(list(e.path)))
    if errors:
        raise ValueError('\n'.join('/'.join(map(str,e.path))+': '+e.message for e in errors))
    seen = set()
    for slide in lesson['slides']:
        if slide['id'] in seen: raise ValueError('Duplicate identifier: '+slide['id'])
        seen.add(slide['id'])
    source_ids = [s['id'] for s in lesson['sources']]
    if len(source_ids) != len(set(source_ids)):raise ValueError('Duplicate source identifier')
    if lesson['restart_policy']=='after-n-errors' and 'restart_after_errors' not in lesson:
        raise ValueError('after-n-errors requires restart_after_errors')
    for exercise in lesson['exercises']:
        for item in [exercise]+exercise['steps']:
            if item['id'] in seen:raise ValueError('Duplicate identifier: '+item['id'])
            seen.add(item['id'])
        for step in exercise['steps']:
            if step['type']=='choice' and step['answer'] not in step['options']:
                raise ValueError(step['id']+': correct answer is not an option')
            if step['type']=='numeric' and not all(math.isfinite(step[k]) for k in ['answer','tolerance']):
                raise ValueError(step['id']+': numeric answer and tolerance must be finite')
    return lesson

def load(path):
    def reject(value):raise ValueError('Non-finite JSON number: '+value)
    return validate(json.loads(Path(path).read_text(encoding='utf-8'),parse_constant=reject))

def build(path, out):
    lesson=load(path)
    serialized=json.dumps(lesson,ensure_ascii=False,sort_keys=True)
    digest=hashlib.sha256(serialized.encode()).hexdigest()
    # Escape HTML script delimiters without interpolating learner text into markup.
    payload=serialized.replace('<','\\u003c').replace('>','\\u003e').replace('&','\\u0026')
    html=(ROOT/'templates/lesson.html').read_text(encoding='utf-8').replace('__LESSON_JSON__',payload).replace('__LESSON_DIGEST__',digest)
    out.mkdir(parents=True,exist_ok=True)
    dest=out/(lesson['id']+'.html');dest.write_text(html,encoding='utf-8',newline='\n')
    manifest={'lesson':lesson['id'],'revision':lesson['revision'],'sha256':digest,'source':str(Path(path)),'output':dest.name,'status':'prototype; no efficacy validation'}
    (out/(lesson['id']+'.manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(dest)
    return dest

def doctor():
    results={k:shutil.which(k) for k in ['node','npm','docker','pdflatex','latexmk','pdftoppm']}
    results['python']=sys.version.split()[0]
    cli=ROOT/'node_modules/.bin'/('rea.cmd' if os.name=='nt' else 'rea');results['rea_cli']=str(cli) if cli.exists() else None
    try:
        import importlib.metadata
        results['jsonschema']=importlib.metadata.version('jsonschema')
    except importlib.metadata.PackageNotFoundError:results['jsonschema']=None
    if hasattr(os,'sysconf'):
        try:results['ram_gib']=round(os.sysconf('SC_PAGE_SIZE')*os.sysconf('SC_PHYS_PAGES')/1024**3,1)
        except (ValueError,OSError):pass
    print(json.dumps(results,indent=2))
    return 0 if results['jsonschema'] else 1

def main():
    for stream in (sys.stdout,sys.stderr):  # Windows consoles default to cp1252; lesson text is UTF-8
        if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('doctor')
    p=sub.add_parser('validate');p.add_argument('lesson',type=Path)
    p=sub.add_parser('build');p.add_argument('lesson',type=Path);p.add_argument('--out',type=Path,default=ROOT/'build')
    p=sub.add_parser('rea-fgv');p.add_argument('--max-heap-mb',type=int,default=512)
    p=sub.add_parser('normalize',help='migrate any known lesson file to schema 1.0, validate it and print the JSON');p.add_argument('lesson',type=Path)
    args=parser.parse_args()
    try:
        if args.command=='normalize':
            import importlib.util
            spec=importlib.util.spec_from_file_location('lesson_contract',ROOT/'scripts/lesson_contract.py')
            lc=importlib.util.module_from_spec(spec);spec.loader.exec_module(lc)
            lesson=lc.normalize(args.lesson)
            print(json.dumps({'lesson':lesson,'content_digest':lc.content_digest(lesson),'migrated_from':lesson.get('migrated_from')},ensure_ascii=False))
            return 0
        if args.command=='doctor':return doctor()
        if args.command=='validate':load(args.lesson);print('Valid:',args.lesson);return 0
        if args.command=='build':build(args.lesson,args.out);return 0
        cli=ROOT/'node_modules/.bin'/('rea.cmd' if os.name=='nt' else 'rea')  # npm writes a .cmd shim on Windows
        if not cli.exists():raise ValueError('Run npm ci first')
        if args.max_heap_mb<128 or args.max_heap_mb>4096:raise ValueError('Use an analyzer heap between 128 and 4096 MiB')
        out=ROOT/'build/evidence';out.mkdir(parents=True,exist_ok=True)
        cmd=[str(cli),'analyze-javascript-application',str(ROOT/'inputs/fgv'), '--max-heap-mb',str(args.max_heap_mb),'--analysis-timeout-ms','120000','--format','json']
        (out/'command.json').write_text(json.dumps(cmd,indent=2)+'\n',encoding='utf-8',newline='\n')
        with (out/'fgv-rea.json').open('w',encoding='utf-8',newline='\n') as stdout,(out/'fgv-rea.stderr.txt').open('w',encoding='utf-8',newline='\n') as stderr:
            result=subprocess.run(cmd,stdout=stdout,stderr=stderr,timeout=900)
        print('Evidence:',out/'fgv-rea.json','exit:',result.returncode)
        return result.returncode
    except (ValueError,ImportError,subprocess.TimeoutExpired) as e:
        print(str(e),file=sys.stderr);return 1

if __name__=='__main__':raise SystemExit(main())
