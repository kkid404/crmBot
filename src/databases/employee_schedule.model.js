const mongoose = require('mongoose');

const employeeScheduleSchema = new mongoose.Schema({
    shiftStart: { type: Date },
    shiftEnd: { type: Date, default: null },
    creativeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
}, {
    timestamps: true,
});

const EmployeeSchedule = mongoose.model('EmployeeSchedule', employeeScheduleSchema);
module.exports = EmployeeSchedule;