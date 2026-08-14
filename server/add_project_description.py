from pathlib import Path

p = Path("server.js")
s = p.read_text()

marker = "// VIEW ALL PROJECTS"

if marker not in s:
    print("ERROR: VIEW ALL PROJECTS marker not found")
    raise SystemExit(1)

block = r'''// SET PROJECT DESCRIPTION
if (
  lowerMessage.startsWith("describe my project") ||
  lowerMessage.startsWith("describe the project")
) {
  const match = message.match(
    /^describe (?:my|the) project\s+(.+?)\s+(?:as|:)\s+(.+)$/i
  );

  if (!match) {
    return res.json({
      reply:
        "Use: Describe my project [project name] as [description].",
    });
  }

  const projectName = match[1].trim();
  const description = match[2].trim();

  const project = projects.find(
    (project) =>
      project.name.toLowerCase() === projectName.toLowerCase()
  );

  if (!project) {
    return res.json({
      reply: `I couldn't find a project called "${projectName}".`,
    });
  }

  project.description = description;

  fs.writeFileSync(
    projectsFile,
    JSON.stringify(projects, null, 2)
  );

  return res.json({
    reply:
      `I've updated the description for "${project.name}".\n\n` +
      `Description: ${project.description}`,
    project,
  });
}

'''

p.write_text(s.replace(marker, block + marker, 1))
print("Project description feature added.")
