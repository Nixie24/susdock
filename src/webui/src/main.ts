import "./stylesheet.css";
import "./components/sd-app";

// 脚本就绪后淡出加载遮罩
const splash = document.getElementById("loading");
if (splash !== null) {
    splash.classList.add("done");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
}
