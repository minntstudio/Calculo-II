// Configuración de la aplicación
const express = require("express");
const path = require("path");
const app = express();
const PORT = 3001;
const cors = require("cors");
app.use(cors())

// const db = require("./database/models")

// Requerir method overside para hacer formulario de edición de producto
const methodOverride = require("method-override");
app.use(methodOverride("_method"));

// Requerir middleware remember.
// const cookieMiddleware = require("./middleware/userMiddleware/cookieMiddleware");

// Configurar Express para que use bodyParser
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Configurar Express para que use sesiones
// const session = require("express-session");
// app.use(session({ secret: "token", resave: true, saveUninitialized: true }));

// Requerir cookieParser.
const cookieParser = require("cookie-parser");

// Usar cookieParser.
app.use(cookieParser());

// Usar middleware recordar.
// app.use(cookieMiddleware);

// Configurar Express para que use EJS como motor de plantillas.
app.set("view engine", "ejs");
app.set("views", "./src/views");

// Configurar Express para que use archivos estáticos del directorio public.
app.use(express.static(path.join(__dirname, "/public")));

// Rutas
const homeRouter = require("./src/routers/home");

// Configurar las rutas
app.use("/", homeRouter);

app.use((req,res,next) => {
    res.status(404).render("products/error")
})


// Iniciar el servidor
app.listen(PORT, () => console.log("El servidor está corriendo en: http://localhost:3001"));