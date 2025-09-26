const Contact = require('../models/Contact');

// @desc    Save categorized contacts for a user
// @route   POST /api/contacts
// @access  Private
const saveContacts = async (req, res) => {
    // Expect an array of contacts in the request body
    const { contacts } = req.body; 

    console.log("req.user", req.user);
    console.log("contacts", contacts);

    if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ message: 'Request body must be an array of contacts.' });
    }

    try {
        // Create an array of documents to be saved
        const contactsToSave = contacts.map(contact => ({
            userId: req.user._id,
            phoneNumber: contact.phoneNumber,
            name: contact.name,
            role: contact.role,
        }));

        // Use bulk write to efficiently update or insert contacts
        const bulkOps = contactsToSave.map(contact => ({
            updateOne: {
                filter: { userId: contact.userId, phoneNumber: contact.phoneNumber },
                update: { $set: contact },
                upsert: true, // This will insert if not found, or update if found
            },
        }));

        await Contact.bulkWrite(bulkOps);

        res.status(200).json({ message: 'Contacts saved successfully.' });
    } catch (error) {
        console.error('Error saving contacts:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { saveContacts };