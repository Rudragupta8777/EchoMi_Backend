const SummaryService = require("../services/summaryService");
const CallLog = require("../models/CallLog");

// Get summary for a specific call
const getCallSummary = async (req, res) => {
  try {
    const { callSid } = req.params;

    if (!callSid) {
      return res.status(400).json({
        success: false,
        error: "callSid parameter is required",
      });
    }

    const result = await SummaryService.getCallSummary(callSid);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json({
      success: true,
      message: "Call summary retrieved successfully",
      data: result.data,
    });
  } catch (error) {
    console.error("Error getting call summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get call summary",
    });
  }
};

// Generate summary for a specific call (manual trigger)
const generateCallSummary = async (req, res) => {
  try {
    const { callSid } = req.params;

    if (!callSid) {
      return res.status(400).json({
        success: false,
        error: "callSid parameter is required",
      });
    }

    const result = await SummaryService.generateCallSummary(callSid);

    if (!result?.success) {
      return res.status(500).json({
        success: false,
        error: result?.error || "Failed to generate summary",
      });
    }

    res.status(200).json({
      success: true,
      message: "Call summary generated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error generating call summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate call summary",
    });
  }
};

// Get all calls with their summaries for a user
const getUserCallSummaries = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, hasSummary } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId parameter is required",
      });
    }

    const filter = { userId };

    // Filter by summary existence if specified
    if (hasSummary === "true") {
      filter.summary = { $exists: true, $ne: null };
    } else if (hasSummary === "false") {
      filter.summary = { $exists: false };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const calls = await CallLog.find(filter)
      .select(
        "callSid callerNumber startTime duration summary summaryGeneratedAt transcript"
      )
      .populate("userId", "name")
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await CallLog.countDocuments(filter);

    const formattedCalls = calls.map((call) => ({
      callSid: call.callSid,
      callerNumber: call.callerNumber,
      userName: call.userId?.name,
      startTime: call.startTime,
      duration: call.duration,
      summary: call.summary,
      summaryGeneratedAt: call.summaryGeneratedAt,
      hasSummary: !!call.summary,
      hasTranscript: call.transcript && call.transcript.length > 0,
      transcriptLength: call.transcript?.length || 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        calls: formattedCalls,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: skip + calls.length < totalCount,
        },
      },
    });
  } catch (error) {
    console.error("Error getting user call summaries:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get call summaries",
    });
  }
};

// Bulk generate summaries for calls missing summaries
const generateMissingSummaries = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    console.log("🔄 Starting bulk summary generation...");
    const result = await SummaryService.generateMissingSummaries(
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      message: `Bulk summary generation completed. Processed ${result.processed} calls, generated ${result.successful} summaries.`,
      data: result,
    });
  } catch (error) {
    console.error("Error in bulk summary generation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate missing summaries",
    });
  }
};

module.exports = {
  getCallSummary,
  generateCallSummary,
  getUserCallSummaries,
  generateMissingSummaries,
};
