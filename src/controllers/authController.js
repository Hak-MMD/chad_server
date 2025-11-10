const register = async (req, res) => {
  const data = req.body;

  try {
    if (!data.name || !data.email || !data.password) {
      return res.status(400).json({ message: "Please provide all values" });
    }
    const userExist = await UserModel.findOne({ email: data.email });

    if (userExist) {
      return res
        .status(400)
        .json({ message: "User already exist! Try another email!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(data.password, salt);
    const lastLog = new Date();
    // const profileImage = {
    //     public_id:
    // }
    const user = await UserModel.create({
      name: data.name,
      email: data.email,
      password: hashedPass,
      lastLogin: lastLog,
      refreshToken: "",
    });

    res.json(user);
  } catch (error) {
    return res.status(500).json({ message: `Error Register: ${error}` });
  }
};

const login = async (req, res) => {
  const data = req.body;

  try {
    if (!data.email || !data.password) {
      return res.status(400).json({ message: "Please provide all values" });
    }
    const user = await UserModel.findOne({ email: data.email });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials!" });
    }

    const isMatch = await bcrypt.compare(data.password, user.password);

    if (isMatch) {
      const accessToken = jwt.sign(
        {
          userId: user._id,
          email: user.email,
        },
        process.env.ACCESS_SECRET,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        {
          userId: user._id,
          email: user.email,
        },
        process.env.REFRESH_SECRET,
        { expiresIn: "30d" }
      );

      user.refreshToken = refreshToken;
      user.lastLogin = new Date();

      await user.save();

      res.cookie("jwt", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "None",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({ accessToken, user });
    } else {
      return res.status(400).json({ message: "Invalid credentials!" });
    }
  } catch (error) {
    return res.status(500).json({ message: `Error Login: ${error}` });
  }
};

const refreshToken = async (req, res) => {
  const cookies = req.cookies;

  try {
    if (!cookies?.jwt) {
      return res.status(401).json({ message: "Unauthorized!" });
    }

    const refreshToken = cookies.jwt;

    jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET,
      async (err, decoded) => {
        try {
          if (err) return res.status(403).json({ message: "Forbidden" });

          const user = await UserModel.findOne({ email: decoded.email }).exec();

          if (!user) return res.status(401).json({ message: "Forbidden" });

          const accessToken = jwt.sign(
            {
              userId: user._id,
              email: user.email,
            },
            process.env.ACCESS_SECRET,
            { expiresIn: "15m" }
          );

          res.json({ accessToken });
        } catch (error) {
          console.log(error);
        }
      }
    );
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Error Refresh accessToken: ${error}` });
  }
};

const logout = async (req, res) => {
  const cookies = req.cookies;

  try {
    if (!cookies?.jwt) return res.status(204).json({ message: "No Token!" });

    res.clearCookie("jwt", { httpOnly: true, secure: true, sameSite: "None" });

    //delete user's refresh token
    // const user = await UserModel.findOne({ email: req.user.email });
    // user.refreshToken = '';
    // await user.save();

    res.json({ message: "Cookie cleared!" });
  } catch (error) {
    return res.status(500).json({ message: `Error Logout: ${error}` });
  }
};

const verifyEmail = async (req, res) => {
  try {
  } catch (error) {}
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  verifyEmail,
};
