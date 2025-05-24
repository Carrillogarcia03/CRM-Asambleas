const sql = require('../db');
const bcrypt = require('bcrypt');

exports.login = async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const result = await sql.query`
      SELECT * FROM InicioSesionUsuario WHERE usuario = ${usuario}
    `;

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const user = result.recordset[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Autenticación exitosa
    res.json({
      message: 'Login exitoso',
      role: user.rol,
      redirect: user.rol === 'admin' ? '/home.html' : '/user-home.html'
    });

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};
exports.register = async (req, res) => {
  const { usuario, password, rol } = req.body;

  try {
    // Verificar si el usuario ya existe
    const existingUser = await sql.query`
      SELECT * FROM InicioSesionUsuario WHERE usuario = ${usuario}
    `;

    if (existingUser.recordset.length > 0) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar el nuevo usuario
    await sql.query`
      INSERT INTO InicioSesionUsuario (usuario, password, rol) VALUES (${usuario}, ${hashedPassword}, ${rol})
    `;

    res.status(201).json({ message: 'Usuario registrado exitosamente' });

  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};