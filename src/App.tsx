import { useEffect, useState } from "react";
import "./App.css";

type Message = {
  role: "user" | "assistant";
  text: string;
};

function App() {
   const [view, setView] = useState<
  "chat" | "projects" | "project" | "tasks" | "calendar"
>("chat");

const [selectedProject, setSelectedProject] = useState<number | null>(null);
const [message, setMessage] = useState("");
const [messages, setMessages] = useState<Message[]>([]);
const [loading, setLoading] = useState(false);

const [tasks, setTasks] = useState<
  { id: number; title: string; completed: boolean }[]
>([]);

const [projects, setProjects] = useState<
  {
    id: number;
    name: string;
    description: string;
    status: string;
    tasks: {
  id: number;
  title: string;
  completed: boolean;
  output?: string | null;
}[];
  }[]
>([]);

useEffect(() => {
  if (view !== "tasks") return;

  fetch("/api/tasks")
    .then((response) => response.json())
    .then((data) => {
      setTasks(data.tasks || []);
    })
    .catch((error) => {
      console.error("Could not load tasks:", error);
    });
}, [view]);
useEffect(() => {
  if (view !== "projects") return;

  fetch("/api/projects")
    .then((response) => response.json())
    .then((data) => {
      setProjects(data.projects || []);
    })
    .catch((error) => {
      console.error("Could not load projects:", error);
    });
}, [view]);
  const sendMessage = async () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || loading) return;

    const userMessage: Message = {
      role: "user",
      text: trimmedMessage,
    };

    setMessages((current) => [...current, userMessage]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      const assistantMessage: Message = {
        role: "assistant",
        text: data.reply || "I didn't receive a response.",
      };

      setMessages((current) => [
        ...current,
        assistantMessage,
      ]);
    } catch (error) {
      console.error("Assistly error:", error);

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: "Assistly couldn't process that request right now. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
    <nav className="sidebar">
  <div className="sidebar-title">Assistly</div>

  <button
    className={view === "chat" ? "nav-button active" : "nav-button"}
    onClick={() => setView("chat")}
  >
    💬 Chat
  </button>

  <button
    className={view === "projects" ? "nav-button active" : "nav-button"}
    onClick={() => setView("projects")}
  >
    📁 Projects
  </button>

  <button
    className={view === "tasks" ? "nav-button active" : "nav-button"}
    onClick={() => setView("tasks")}
  >
    ✅ Tasks
  </button>

  <button
    className={view === "calendar" ? "nav-button active" : "nav-button"}
    onClick={() => setView("calendar")}
  >
    📅 Calendar
  </button>
</nav>
      <header className="header">
        <div>
          <h1>Assistly AI</h1>
          <p>Your business. Powered by AI.</p>
        </div>

        <div className="status">
          <span className="status-dot"></span>
          Online
        </div>
      </header>

      <main className="chat-container">
        {view === "project" ? (
  <div className="page">
    {(() => {
      const project = projects.find(
        (item) => item.id === selectedProject
      );

      if (!project) {
        return (
          <div>
            <h2>Project not found</h2>

            <button
              onClick={() => setView("projects")}
            >
              ← Back to Projects
            </button>
          </div>
        );
      }

      const completedTasks = project.tasks.filter(
        (task) => task.completed
      ).length;

      const totalTasks = project.tasks.length;

      const progress =
        totalTasks === 0
          ? 0
          : Math.round(
              (completedTasks / totalTasks) * 100
            );

      return (
        <>
          <button
            className="back-button"
            onClick={() => setView("projects")}
          >
            ← Back to Projects
          </button>

          <h2>{project.name}</h2>

          <p>
            {project.description ||
              "No description provided."}
          </p>

          <p>
            Status: {project.status}
          </p>

          <p>
            Progress: {completedTasks}/{totalTasks} tasks
            completed ({progress}%)
          </p>

          <h3>Tasks</h3>
<button
  className="work-button"
  onClick={async () => {
    const taskMessage =
      `Work on the next task for ${project.name}`;

    setView("chat");
    setMessage("");
    setLoading(true);

    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: taskMessage,
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: taskMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Request failed"
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            data.reply ||
            "I didn't receive a response.",
        },
      ]);
    } catch (error) {
      console.error(
        "Assistly project task error:",
        error
      );

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            "Assistly couldn't process that task right now. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }}
>
  🚀 Work on Next Task
</button>
          {project.tasks.length === 0 ? (
            <p>No tasks yet.</p>
          ) : (
            <div className="task-list">
            {project.tasks.map((task) => (
  <div
    className="task-item"
    key={task.id}
    onClick={async () => {
      try {
        const response = await fetch(
          `/api/projects/${project.id}/tasks/${task.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              completed: !task.completed,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Failed to update project task"
          );
        }

        setProjects((current) =>
          current.map((item) =>
            item.id === project.id ? data.project : item
          )
        );
      } catch (error) {
        console.error(
          "Could not update project task:",
          error
        );
      }
    }}
  >
    <div>
      {task.completed ? "✅" : "⬜"}{" "}
      {task.title}
    </div>

    {task.completed && task.output && (
      <details
        className="task-output"
        onClick={(event) => event.stopPropagation()}
      >
        <summary>View output</summary>

        <div className="task-output-content">
          {task.output}
        </div>
      </details>
    )}
  </div>
))}
            </div>
          )}
        </>
      );
    })()}
  </div>
) : view === "projects" ? (
  <div className="page">
    <h2>Projects</h2>

    {projects.length === 0 ? (
      <p>No projects yet.</p>
    ) : (
      <div className="project-list">
        {projects.map((project) => (
          <div
  className="project-item"
  key={project.id}
  onClick={() => {
    setSelectedProject(project.id);
    setView("project");
  }}
>
            <h3>{project.name}</h3>

            <p>
              {project.description || "No description provided."}
            </p>

            <p>
              Status: {project.status}
            </p>

            <p>
              Tasks:{" "}
              {project.tasks.filter((task) => task.completed).length}
              /{project.tasks.length} completed
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
) : view === "tasks" ? (
  <div className="page">
    <h2>Tasks</h2>

    {tasks.length === 0 ? (
      <p>No tasks yet.</p>
    ) : (
      <div className="task-list">
        {tasks.map((task) => (
          <div
  className="task-item"
  key={task.id}
  onClick={async () => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          completed: !task.completed,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update task");
      }

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? data.task : item
        )
      );
    } catch (error) {
      console.error("Could not update task:", error);
    }
  }}
>
  <span>
    {task.completed ? "✅" : "⬜"} {task.title}
  </span>
</div>
        ))}
      </div>
    )}
  </div>
) : messages.length === 0 ? (
          <div className="welcome">
            <h2>What can I help you with?</h2>

            <p>
              Ask Assistly to manage tasks, projects,
              schedules, research, or work on your projects.
            </p>

            <div className="suggestions">
              <button
                onClick={() =>
                  setMessage("Show my projects")
                }
              >
                📁 Show my projects
              </button>

              <button
                onClick={() =>
                  setMessage("Show my tasks")
                }
              >
                ✅ Show my tasks
              </button>

              <button
                onClick={() =>
                  setMessage("What's on my calendar?")
                }
              >
                📅 Show my calendar
              </button>

              <button
                onClick={() =>
                  setMessage("Work on the next task")
                }
              >
                🚀 Work on next task
              </button>
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((item, index) => (
              <div
                key={index}
                className={`message ${
                  item.role === "user"
                    ? "user-message"
                    : "assistant-message"
                }`}
              >
                <div className="message-label">
                  {item.role === "user"
                    ? "You"
                    : "Assistly"}
                </div>

                <div className="message-text">
                  {item.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message assistant-message">
                <div className="message-label">
                  Assistly
                </div>

                <div className="message-text">
                  Assistly is working...
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <div className="input-area">
        <input
          type="text"
          placeholder="Ask Assistly anything..."
          value={message}
          disabled={loading}
          onChange={(e) =>
            setMessage(e.target.value)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sendMessage();
            }
          }}
        />

        <button
          onClick={sendMessage}
          disabled={loading || !message.trim()}
        >
          {loading ? "Working..." : "Send"}
        </button>
      </div>
    </div>
  );
}

export default App;