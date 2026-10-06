let websocket;
let context;
let actionUuid;
let settings = {};
let buttons = [];

const projectPathInput = document.getElementById("projectPath");
const refreshButton = document.getElementById("refresh");
const buttonSelect = document.getElementById("buttonSelect");
const saveButton = document.getElementById("save");
const statusText = document.getElementById("status");

window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, _info, actionInfo) => {
  context = uuid;
  actionUuid = JSON.parse(actionInfo).action;
  websocket = new WebSocket(`ws://127.0.0.1:${port}`);
  settings = JSON.parse(actionInfo).payload?.settings ?? {};

  websocket.addEventListener("open", () => {
    websocket.send(JSON.stringify({ event: registerEvent, uuid }));
    projectPathInput.value = settings.projectPath ?? "";
    requestButtons();
  });

  websocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.event === "sendToPropertyInspector" && message.payload?.type === "buttons") {
      buttons = message.payload.buttons ?? [];
      renderButtons(message.payload.error);
    }
    if (message.event === "didReceiveSettings") {
      settings = message.payload?.settings ?? {};
      projectPathInput.value = settings.projectPath ?? "";
    }
  });
};

refreshButton.addEventListener("click", requestButtons);
saveButton.addEventListener("click", saveBinding);

function requestButtons() {
  sendToPlugin({ type: "listButtons", projectPath: projectPathInput.value.trim() });
  statusText.textContent = "Refreshing...";
}

function saveBinding() {
  const selected = buttons.find((button) => button.id === buttonSelect.value);
  if (!selected) {
    statusText.textContent = "Select a Snipsy snippet first.";
    return;
  }
  settings = {
    projectPath: projectPathInput.value.trim(),
    snippetId: selected.id,
    snippetType: selected.snippetType,
    title: selected.title,
    iconDataUrl: selected.iconDataUrl,
  };
  sendToPlugin({ type: "saveBinding", settings });
  statusText.textContent = "Binding saved.";
}

function renderButtons(error) {
  buttonSelect.innerHTML = "";
  if (error) {
    buttonSelect.add(new Option(error, ""));
    statusText.textContent = error;
    return;
  }
  if (buttons.length === 0) {
    buttonSelect.add(new Option("No snippets found", ""));
    statusText.textContent = "No snippets found.";
    return;
  }
  for (const button of buttons) {
    buttonSelect.add(new Option(`${button.title} (${button.snippetType})`, button.id));
  }
  buttonSelect.value = settings.snippetId ?? buttons[0].id;
  statusText.textContent = `${buttons.length} snippet${buttons.length === 1 ? "" : "s"} loaded.`;
}

function sendToPlugin(payload) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    statusText.textContent = "Stream Deck connection is not ready.";
    return;
  }
  websocket.send(JSON.stringify({ event: "sendToPlugin", action: actionUuid, context, payload }));
}
