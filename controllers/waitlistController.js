const WaitlistModel = require("../models/Waitlist");

const addToWaitlist = async (req, res) => {
  const { email } = req.body;
  try {
    if (!email) {
      return res.status(400).json({ errorMessage: "Email is required" });
    }

    const userExists = await WaitlistModel.find({ email });
    if (userExists.length > 0) {
      return res
        .status(400)
        .json({ errorMessage: "Email already in the waitlist" });
    }

    const newUser = await WaitlistModel.create({ email });

    if (!newUser) {
      return res
        .status(400)
        .json({ errorMessage: "DB error. Please try again later." });
    }

    res.status(200).json({
      reply: "Thank you for joining the waitlist!",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ errorMessage: messages[0] });
    } else {
      return res
        .status(500)
        .json({ errorMessage: "Something went wrong. Try again later!" });
    }
  }
};

const display = async (req, res) => {
  try {
    const allUsers = await WaitlistModel.find({});
    // console.log(allUsers.length);

    res.status(200).json({
      reply: allUsers.length,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ errorMessage: "Something went wrong. Try again later!" });
  }
};

module.exports = { addToWaitlist, display };
