const express = require("express");
const router = express.Router();
const controller = require("../controllers/homeController");
const upload = require("../../middleware/multerMiddleware");
const createValidation = require("../../middleware/formMiddleware");

// Pagina principal
router.get("/", controller.home);

// Envio del Archivo de audio
router.post("/", upload("records").single("record"), controller.create);

module.exports = router