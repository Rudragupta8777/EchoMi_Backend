const express = require('express');
const router = express.Router();
const smsVerificationService = require('../services/smsVerificationService');
const { resumeConversationAfterApproval } = require('../services/conversationResumeService');

router.post('/approve', async (req, res) => {
    try {
        const { approvalId, approved, userId } = req.body;
        console.log(`[OTP APPROVAL] 📥 Received approval: ${approvalId}, approved: ${approved}, userId: ${userId}`);
        
        if (!approvalId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Approval ID is required' 
            });
        }
        
        const result = await smsVerificationService.processUserResponse(
            approvalId, 
            approved === true || approved === 'true',
            userId
        );
        
        if (result.success) {
            console.log(`[OTP APPROVAL] ✅ User ${approved ? 'approved' : 'rejected'} OTP sharing for ${result.company}`);
            
            // CRITICAL: Resume the conversation if approved
            if (approved === true || approved === 'true') {
                console.log(`[OTP APPROVAL] 🔄 Attempting to resume conversation for approval: ${approvalId}`);
                
                try {
                    const resumeResult = await resumeConversationAfterApproval(approvalId, result.company);
                    if (resumeResult.success) {
                        console.log(`[OTP APPROVAL] ✅ Conversation resumed successfully: ${resumeResult.message}`);
                    } else {
                        console.error(`[OTP APPROVAL] ❌ Failed to resume conversation: ${resumeResult.error}`);
                    }
                } catch (resumeError) {
                    console.error(`[OTP APPROVAL] ❌ Error during conversation resume:`, resumeError);
                }
            } else {
                console.log(`[OTP APPROVAL] 🚫 OTP sharing rejected, not resuming conversation`);
            }
            
            res.status(200).json({
                success: true,
                message: result.message,
                action: result.action,
                company: result.company
            });
        } else {
            console.log(`[OTP APPROVAL] ❌ Approval processing failed: ${result.message}`);
            res.status(404).json({
                success: false,
                error: result.error || 'Approval not found or expired'
            });
        }
    } catch (error) {
        console.error('[OTP ROUTES] ❌ Error processing approval:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error processing approval'
        });
    }
});

router.get('/status/:approvalId', async (req, res) => {
    try {
        const { approvalId } = req.params;
        if (!approvalId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Approval ID is required' 
            });
        }
        const status = await smsVerificationService.getApprovalStatus(approvalId);
        if (status.found) {
            res.status(200).json({
                success: true,
                status: status.status,
                approved: status.approved,
                expired: status.expired,
                timestamp: status.timestamp
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Approval not found'
            });
        }
    } catch (error) {
        console.error('[OTP ROUTES] Error checking approval status:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error checking status'
        });
    }
});

router.post('/request', async (req, res) => {
    try {
        const { userId, company, fcmToken, callerNumber, callSid } = req.body;
        if (!userId || !company) {
            return res.status(400).json({ 
                success: false, 
                error: 'userId and company are required' 
            });
        }
        const result = await smsVerificationService.requestUserApproval(
            userId,
            fcmToken,
            company,
            callerNumber || 'Unknown',
            callSid
        );
        if (result.sent) {
            res.status(200).json({
                success: true,
                message: 'Approval request sent successfully',
                approvalId: result.approvalId
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error || 'Failed to send approval request'
            });
        }
    } catch (error) {
        console.error('[OTP ROUTES] Error sending approval request:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error sending request'
        });
    }
});

module.exports = router;
