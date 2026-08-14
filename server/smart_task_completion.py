from pathlib import Path

p = Path("server.js")
s = p.read_text()

old = "  nextTask.output = taskResponse.text;\n  nextTask.completed = true;\n"

new = """  nextTask.output = taskResponse.text;

  const responseText = taskResponse.text.toLowerCase();

  const needsInformation =
    responseText.includes("i need additional information") ||
    responseText.includes("i need more information") ||
    responseText.includes("please provide") ||
    responseText.includes("need the specific") ||
    responseText.includes("cannot proceed") ||
    responseText.includes("can't proceed") ||
    responseText.includes("unable to proceed") ||
    responseText.includes("not enough information");

  nextTask.completed = !needsInformation;
"""

if old not in s:
    print("ERROR: task completion block not found")
    raise SystemExit(1)

p.write_text(s.replace(old, new, 1))
print("Smart task completion added.")