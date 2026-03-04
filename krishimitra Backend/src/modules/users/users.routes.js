const express = require("express");

const router = express.Router();

// Simple placeholder route so /api/v1/users works
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Users route is wired correctly. Implement real logic later.",
  });
});

module.exports = router;

