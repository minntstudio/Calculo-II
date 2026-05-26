const fs = require("fs");
const path = require("path");
const allRecordsPath = "../../recordMap/allRecords.json";

const homeController = {

  // Obtenemos los datos del JSON.
  allProducts: (JSON.parse(fs.readFileSync(path.join(__dirname, allRecordsPath), "utf-8"))),

  // Renderizamos home.
  home: async (req, res) => {
    res.render("home/index", {})
  },

  create: async (req, res) => {
    try {
        const filePath = path.join(__dirname, allRecordsPath);

        // 1. Leer el archivo actual
        const actualContent = fs.readFileSync(filePath, "utf-8");
        
        // 2. Parsear el contenido de forma segura
        let recordsArray = [];
        if (actualContent.trim() !== "") {
            const parsedData = JSON.parse(actualContent);
            // Si lo que parseamos es un array, lo usamos. Si no, lo envolvemos en uno.
            recordsArray = Array.isArray(parsedData) ? parsedData : [parsedData];
        }

        // 3. Generar ID único incremental de forma segura
        const newId = recordsArray.length > 0 && recordsArray[recordsArray.length - 1].id 
            ? recordsArray[recordsArray.length - 1].id + 1 
            : 1;


        if (req.file) {
            console.log(req.file)
        } else {
            console.log("bruh")
        }
        // 4. Estructurar el nuevo registro
        const newRecord = {
            id: newId,
            name: req.body.name,
            path: req.file ? req.file.destination : null,
            record: req.file ? req.file.filename : "default-record.wav"
        };

        // 5. Ahora sí, .push() funcionará siempre sin romperse
        recordsArray.push(newRecord);

        // 6. Escribir los cambios devuelta en el JSON
        fs.writeFileSync(filePath, JSON.stringify(recordsArray, null, 2), "utf-8");
        
        // 7. Redirección exitosa
        res.redirect("/");

    } catch (error) {
        console.error("Error al guardar el producto:", error);
        res.status(500).send("Error interno del servidor");
    }
}
}
module.exports = homeController;