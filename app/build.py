"""Assemble the single-file app: inlines demo data and the core rules into the page.
Usage: python3 app/build.py   (run from the repo root)"""
import pathlib
src = pathlib.Path(__file__).parent / "src"
page = (src / "app.src.html").read_text()
data = (src / "data.json").read_text().replace("</", "<\\/")
core = (src / "core.js").read_text()
out = page.replace("/*__DATA__*/null", data).replace("/*__CORE__*/", core)
(pathlib.Path(__file__).parent / "release-notes-agent.html").write_text(out)
print("Built app/release-notes-agent.html")
