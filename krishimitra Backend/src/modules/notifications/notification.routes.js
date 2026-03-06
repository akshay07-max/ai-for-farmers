const express = require("express");
const router = express.Router();
const { protect } = require("../../middlewares/auth");
const { sendSuccess, sendError } = require("../../utils/response");
const Notification = require("../../models/Notification");

/**
 * GET /api/v1/notifications
 * Returns the logged-in farmer's notification history (last 50).
 * Supports ?unreadOnly=true to fetch only unread.
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;

    const filter = { userId: req.user._id };
    if (unreadOnly === "true") filter.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .select("-__v"),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user._id, isRead: false }),
    ]);

    sendSuccess(res, 200, "Notifications fetched.", {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch("/:id/read", protect, async (req, res, next) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true, readAt: new Date() },
      { new: true },
    );

    if (!notif) {
      return sendError(res, 404, "Notification not found.", "ERR_NOT_FOUND");
    }

    sendSuccess(res, 200, "Notification marked as read.", {
      notification: notif,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/notifications/read-all
 * Mark ALL of the user's notifications as read.
 */
router.patch("/read-all", protect, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    sendSuccess(
      res,
      200,
      `${result.modifiedCount} notifications marked as read.`,
      {
        updatedCount: result.modifiedCount,
      },
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
