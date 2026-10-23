// node --import ./tests/adversarial/html-loader.mjs : lets node import src/app.html as a text module (like the Workers Text rule).
import { register } from "node:module";
register("./html-hooks.mjs", import.meta.url);
