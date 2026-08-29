import json, sys
from pathlib import Path
from graphify.detect import detect
from graphify.extract import collect_files, extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

ROOT="."; out=Path("graphify-out"); out.mkdir(exist_ok=True)
(out/".graphify_python").write_text(sys.executable); (out/".graphify_root").write_text(".")
det=detect(Path(ROOT)); (out/".graphify_detect.json").write_text(json.dumps(det,ensure_ascii=False))
files=det.get("files",{})
srcs=[]
# This project is currently spec-only: include documents alongside code so the
# graph reflects the real corpus. Code files are picked up automatically as they land.
for bucket in ("code","document"):
    for f in files.get(bucket,[]):
        p=Path(f)
        srcs += (collect_files(p) if p.is_dir() else [p])
srcs=[p for p in srcs if p.suffix.lower()!=".json"]
if not srcs: raise SystemExit("no source files")
ex=extract(srcs, cache_root=Path(ROOT), parallel=False)   # parallel=False is REQUIRED
G=build_from_json(ex, root=ROOT, directed=False)
if G.number_of_nodes()==0: raise SystemExit("empty graph")
comm=cluster(G); coh=score_all(G,comm)
labels={c:"Community "+str(c) for c in comm}
to_json(G,comm,"graphify-out/graph.json",force=bool(__import__("os").environ.get("GRAPHIFY_FORCE")))
rep=generate(G,comm,coh,labels,god_nodes(G),surprising_connections(G,comm),det,
             {"input":0,"output":0},ROOT,suggested_questions=suggest_questions(G,comm,labels))
Path("graphify-out/GRAPH_REPORT.md").write_text(rep)
print("built", G.number_of_nodes(),"nodes", G.number_of_edges(),"edges")
