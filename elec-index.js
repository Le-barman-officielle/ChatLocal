/* 1.2.8 2023-12-16 16:49:20 - Incredibox - Designed with love & passion since 2009 */
const { machineId, machineIdSync } = require("node-machine-id"),
  {
    clipboard,
    ipcMain,
    app,
    BrowserWindow,
    Menu,
    dialog,
  } = require("electron"),
  path = require("path");
let mainWindow, menu;
var langJSON = {
  txt: { quitAppConfirm: "Do you really want to quit Incredibox?" },
  bt: { quit: "Quit", cancel: "Cancel" },
};

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Incredibox",
    width: 1500,
    height: 900,
    minWidth: 500,
    minHeight: 300,
    titleBarStyle: "hidden",
    backgroundColor: "#000000",
    show: false,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: false,
      enableRemoteModule: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "elec-preload.js"),
    },
  });

  // Initialize global vars BEFORE loading the file
  initGlobalVars();
  
  mainWindow.webContents.on("devtools-opened", () => {
    mainWindow.webContents.closeDevTools();
  });
  
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  
  mainWindow.on("close", (e) => {
    if (!app.quitting) {
      e.preventDefault();
      if (process.platform === "darwin") {
        dialog
          .showMessageBox(mainWindow, {
            type: "question",
            title: "Confirm",
            buttons: [langJSON.bt.quit, langJSON.bt.cancel],
            cancelId: 1,
            defaultId: 0,
            message: langJSON.txt.quitAppConfirm,
          })
          .then((result) => {
            if (result.response === 0) {
              mainWindow.destroy();
              app.quit();
            }
          })
          .catch((e) => {});
      } else {
        mainWindow.destroy();
        app.quit();
      }
    }
  });
  
  mainWindow.once("ready-to-show", () => {
    if (mainWindow != null) {
      mainWindow.show();
    }
  });
  
  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

function initGlobalVars() {
  // Ensure mainWindow exists before checking properties
  if (mainWindow) {
    process.env.IS_FULLSCREENABLE = mainWindow.isFullScreenable().toString();
    process.env.IS_MINIMIZABLE = mainWindow.isMinimizable().toString();
  } else {
    process.env.IS_FULLSCREENABLE = "true";
    process.env.IS_MINIMIZABLE = "true";
  }
  process.env.LANG = app.getLocale();
  process.env.UUID = machineIdSync({ original: true });
  process.env.ARG = app.commandLine.getSwitchValue("arg") || "";
}

function initIPC() {
  ipcMain.handle(
    "clipboard",
    (e, text) =>
      new Promise((resolve, reject) => {
        clipboard.writeText(text);
        if (clipboard.readText() === text) {
          resolve();
        } else {
          reject("clipboard bug");
        }
      })
  );
  
  ipcMain.on("isFullScreen", (e) => {
    e.returnValue = mainWindow ? mainWindow.isFullScreen() : false;
  });
  
  ipcMain.on("close", () => {
    if (mainWindow) mainWindow.close();
  });
  
  ipcMain.on("enterFullScreen", () => {
    if (mainWindow) mainWindow.setFullScreen(true);
  });
  
  ipcMain.on("leaveFullScreen", () => {
    if (mainWindow) mainWindow.setFullScreen(false);
  });
  
  ipcMain.on("loadLang", (e, langData) => {
    langJSON = langData;
  });
  
  ipcMain.on("openURL", (e, url) => {
    require("electron").shell.openExternal(url);
  });
  
  ipcMain.on("minimize", () => {
    if (mainWindow) {
      if (mainWindow.isFullScreen()) {
        mainWindow.once("leave-full-screen", () => {
          if (mainWindow) mainWindow.minimize();
        });
        mainWindow.setFullScreen(false);
      } else {
        mainWindow.minimize();
      }
    }
  });
}

function buildMenu() {
  menu = Menu.buildFromTemplate(myMenu);
  Menu.setApplicationMenu(menu);
}

app.name = "Incredibox";

app.on("ready", () => {
  createWindow();
  initIPC();
  buildMenu(); // ADD THIS LINE - This was missing!
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on("before-quit", () => {
  app.quitting = true;
});

app.on("window-all-closed", function () {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});

const myMenu = [
  {
    role: "window",
    submenu: [
      { role: "zoom" },
      { role: "togglefullscreen" },
      { type: "separator" },
      { role: "minimize" },
      { role: "close" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { role: "selectall" },
    ],
  },
];

if (process.platform === "darwin") {
  myMenu.unshift({
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideothers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  });
}