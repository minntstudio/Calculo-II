const multer = require("multer");
const path = require("path");
const fs = require("fs");

function upload(option) {
  // Crea una configuración de almacenamiento para multer.
  const storage = multer.diskStorage({
    // Establece el destino donde se almacenarán los archivos.
    destination: (req, file, cb) => {
      // Obtiene la ruta completa al destino, según el tipo de archivo.
      const destinationPath = path.join(__dirname, `../public/${option}`);

      // Crea el directorio de destino si no existe.
      fs.mkdirSync(destinationPath, { recursive: true });

      // Devuelve el destino a multer.
      cb(null, destinationPath);
    },

    // Establece el nombre del archivo subido.
    filename: (req, file, cb) => {
      // Devuelve el nombre original del archivo.
      cb(null, file.originalname);
    },
  });

  // Devuelve un objeto de multer con la configuración de almacenamiento.
  return multer({ storage });
}

module.exports = upload;