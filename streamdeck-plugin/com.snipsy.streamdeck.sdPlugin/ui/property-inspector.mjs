let websocket;
let context;
let actionUuid;
let settings = {};
let buttons = [];
let projectPath = "";

const buttonSelect = document.getElementById("buttonSelect");
const statusText = document.getElementById("status");

window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  context = uuid;
  actionUuid = JSON.parse(actionInfo).action;
  websocket = new WebSocket(`ws://127.0.0.1:${port}`);
  settings = JSON.parse(actionInfo).payload?.settings ?? {};

  websocket.addEventListener("open", () => {
    websocket.send(JSON.stringify({ event: registerEvent, uuid }));
    requestButtons();
  });

  websocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.event === "sendToPropertyInspector" && message.payload?.type === "buttons") {
      buttons = message.payload.buttons ?? [];
      projectPath = message.payload.projectPath ?? "";
      renderButtons(message.payload.error, message.payload.selectedSnippetId);
    }
    if (message.event === "didReceiveSettings") {
      settings = message.payload?.settings ?? {};
      if (settings.snippetId) {
        buttonSelect.value = settings.snippetId;
      }
    }
  });
};

buttonSelect.addEventListener("change", saveBinding);

function requestButtons() {
  sendToPlugin({ type: "listButtons" });
  statusText.textContent = "Loading snippets from open Snipsy project...";
}

function saveBinding() {
  const selected = buttons.find((button) => button.id === buttonSelect.value);
  if (!selected || !projectPath) {
    statusText.textContent = "Open a Snipsy project, then choose a snippet.";
    return;
  }
  settings = {
    projectPath,
    snippetId: selected.id,
    snippetType: selected.snippetType,
    title: selected.title,
    iconDataUrl: selected.iconDataUrl,
  };
  sendToPlugin({ type: "saveBinding", settings });
  statusText.textContent = `Bound to ${selected.title}.`;
}

function renderButtons(error, selectedSnippetId) {
  buttonSelect.innerHTML = "";
  if (error) {
    const message = error.replace(/\n/g, " ");
    buttonSelect.add(new Option(message, ""));
    buttonSelect.disabled = true;
    statusText.textContent = message;
    return;
  }
  if (buttons.length === 0) {
    buttonSelect.add(new Option("No snippets found", ""));
    buttonSelect.disabled = true;
    statusText.textContent = "No text or video snippets found in the open Snipsy project.";
    return;
  }
  buttonSelect.disabled = false;
  buttonSelect.add(new Option("Choose a snippet...", ""));
  for (const button of buttons) {
    buttonSelect.add(new Option(`${button.title} (${button.snippetType})`, button.id));
  }
  const selectedId = selectedSnippetId ?? settings.snippetId ?? "";
  buttonSelect.value = buttons.some((button) => button.id === selectedId) ? selectedId : "";
  statusText.textContent = `Loaded ${buttons.length} snippet${buttons.length === 1 ? "" : "s"} from the open Snipsy project.`;
}

function sendToPlugin(payload) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    statusText.textContent = "Stream Deck connection is not ready.";
    return;
  }
  websocket.send(JSON.stringify({ event: "sendToPlugin", action: actionUuid, context, payload }));
}
