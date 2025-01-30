const EmployeeSchedule = require('../databases/employee_schedule.model');

class EmployeeScheduleService {
    static async createShift(data) {
        const shift = new EmployeeSchedule(data);
        return shift.save();
    }

    static async findShiftById(id) {
        return EmployeeSchedule.findById(id);
    }

    static async findShiftsByCreativeId(creativeId) {
        return EmployeeSchedule.find({ creativeId });
    }

    static async updateShift(id, updates) {
        return EmployeeSchedule.findByIdAndUpdate(id, updates, { new: true });
    }

    static async deleteShift(id) {
        return EmployeeSchedule.findByIdAndDelete(id);
    }

    static async getAllShifts() {
        return EmployeeSchedule.find({});
    }

    static async isShiftActive(id) {
        const shift = await EmployeeSchedule.findById(id);
        if (!shift) return false;
        
        const now = new Date();
        return now >= shift.shiftStart && now <= shift.shiftEnd;
    }

    static async getActiveShifts() {
        const now = new Date();
        return EmployeeSchedule.find({
            shiftStart: { $lte: now },
            shiftEnd: { $gte: now }
        });
    }

    static async findActiveShiftByCreativeId(creativeId) {
        const now = new Date();
        return EmployeeSchedule.findOne({
            creativeId,
            shiftStart: { $lte: now },
            $or: [
                { shiftEnd: { $gte: now } },
                { shiftEnd: null }
            ]
        });
    }
}

module.exports = EmployeeScheduleService;