from pathlib import Path
import json

p = Path("projects.json")
projects = json.loads(p.read_text())

project = next(
    x for x in projects
    if x["name"] == "Test Project 2"
)

for task in project["tasks"]:
    task["completed"] = False
    task.pop("output", None)

p.write_text(json.dumps(projects, indent=2) + "\n")

print("Test Project 2 reset.")
