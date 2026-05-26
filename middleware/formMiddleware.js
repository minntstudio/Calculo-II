const { body } = require('express-validator');
const path = require("path");

module.exports = [

  // Verifica que el archivo sea válido con una de las siguientes extensiones: .wav .mp3
  body('avatar')
    .custom((value, { req }) => {

      const file = req.file;
      const validFormats = ['.wav', '.mp3', '.m4a'];

      if (file) {
        const fileFormat = path.extname(file.originalname);
        if (!validFormats.includes(fileFormat)) {
          throw new Error('Formato no compatible');
        }
        return true;
      }
      return true;
    }),
];