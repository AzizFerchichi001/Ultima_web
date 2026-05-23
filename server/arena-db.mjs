const DB_CLIENT_REQUESTED = String(process.env.DB_CLIENT ?? "mysql").trim().toLowerCase();

if (!["mysql", "postgres"].includes(DB_CLIENT_REQUESTED)) {
  throw new Error(`Unsupported DB_CLIENT "${DB_CLIENT_REQUESTED}". Use "mysql" or "postgres".`);
}

const impl =
  DB_CLIENT_REQUESTED === "postgres"
    ? await import("./postgres-arena-db.mjs")
    : await import("./mysql-arena-db.mjs");

export const DB_CLIENT_SELECTED = DB_CLIENT_REQUESTED;
export { DB_CLIENT_REQUESTED };

export const cancelReservation = impl.cancelReservation;
export const updateReservationRefund = impl.updateReservationRefund;
export const closePool = impl.closePool;
export const createAnalysis = impl.createAnalysis;
export const createArena = impl.createArena;
export const createCourt = impl.createCourt;
export const createManagedUser = impl.createManagedUser;
export const createReservation = impl.createReservation;
export const createUser = impl.createUser;
export const requestEmailVerification = impl.requestEmailVerification;
export const verifyEmailWithToken = impl.verifyEmailWithToken;
export const verifyEmailWithCode = impl.verifyEmailWithCode;
export const requestPasswordReset = impl.requestPasswordReset;
export const resetPasswordWithToken = impl.resetPasswordWithToken;
export const resetPasswordWithCode = impl.resetPasswordWithCode;
export const findUserByEmail = impl.findUserByEmail;
export const getUserById = impl.getUserById;
export const getAdminOverview = impl.getAdminOverview;
export const getArenaBillingSummary = impl.getArenaBillingSummary;
export const listBillingPlans = impl.listBillingPlans;
export const changeArenaPlan = impl.changeArenaPlan;
export const getCourtAvailability = impl.getCourtAvailability;
export const getCourtById = impl.getCourtById;
export const getLeaderboard = impl.getLeaderboard;
export const getCompetitionDetails = impl.getCompetitionDetails;
export const createCompetition = impl.createCompetition;
export const updateCompetition = impl.updateCompetition;
export const deleteCompetition = impl.deleteCompetition;
export const listCompetitionRegistrations = impl.listCompetitionRegistrations;
export const removeCompetitionRegistration = impl.removeCompetitionRegistration;
export const getReservationTicketDetails = impl.getReservationTicketDetails;
export const getReservationTicketDetailsByQr = impl.getReservationTicketDetailsByQr;
export const verifyReservationTicketSignature = impl.verifyReservationTicketSignature;
export const generateReservationTicketPdfBuffer = impl.generateReservationTicketPdfBuffer;
export const getCoachStudentStats = impl.getCoachStudentStats;
export const listCoachRelationshipsForUser = impl.listCoachRelationshipsForUser;
export const listCoachesForPlayer = impl.listCoachesForPlayer;
export const listCoachRelationshipExpiryReminders = impl.listCoachRelationshipExpiryReminders;
export const getPerformanceForUser = impl.getPerformanceForUser;
export const initializeDatabase = impl.initializeDatabase;
export const listAnalysesForUser = impl.listAnalysesForUser;
export const listArenas = impl.listArenas;
export const listCoachSessions = impl.listCoachSessions;
export const listCoachStudents = impl.listCoachStudents;
export const listCompetitions = impl.listCompetitions;
export const listCourts = impl.listCourts;
export const listAdminReservations = impl.listAdminReservations;
export const listMatches = impl.listMatches;
export const listReservationsForUser = impl.listReservationsForUser;
export const getReservationForUser = impl.getReservationForUser;
export const lookupParticipantsForArena = impl.lookupParticipantsForArena;
export const registerForCompetition = impl.registerForCompetition;
export const requestCoachRelationship = impl.requestCoachRelationship;
export const respondCoachRelationship = impl.respondCoachRelationship;
export const sanitizeUser = impl.sanitizeUser;
export const updateUserProfile = impl.updateUserProfile;
export const persistRefreshToken = impl.persistRefreshToken;
export const consumeRefreshToken = impl.consumeRefreshToken;
export const revokeRefreshTokensForUser = impl.revokeRefreshTokensForUser;
export const listNotificationsForUser = impl.listNotificationsForUser;
export const createNotification = impl.createNotification;
export const markNotificationRead = impl.markNotificationRead;
export const tickLiveMatches = impl.tickLiveMatches;
export const upsertArenaSubscriptionFromProvider = impl.upsertArenaSubscriptionFromProvider;
export const updateAdminReservationStatus = impl.updateAdminReservationStatus;
export const updateMembershipRole = impl.updateMembershipRole;
export const updateMembershipStatus = impl.updateMembershipStatus;
export const deleteUser = impl.deleteUser;
export const getPlayerDashboardData = impl.getPlayerDashboardData;
export const listPlayerMatches = impl.listPlayerMatches;
export const finalizeMatch = impl.finalizeMatch;
export const createCoachSession = impl.createCoachSession;
export const createOrUpdateCoachRelationshipSeed = impl.createOrUpdateCoachRelationshipSeed;
export const updateCoachRelationshipSettings = impl.updateCoachRelationshipSettings;
export const listArenasForCoachBooking = impl.listArenasForCoachBooking;
export const listPadelPlaces = impl.listPadelPlaces;
export const getPadelPlace = impl.getPadelPlace;
export const listPadelTerrains = impl.listPadelTerrains;
export const getPadelTerrain = impl.getPadelTerrain;
export const getPadelAvailability = impl.getPadelAvailability;
export const createPadelReservation = impl.createPadelReservation;

// Coaching system
export const getCoachProfile = impl.getCoachProfile;
export const upsertCoachProfile = impl.upsertCoachProfile;
export const updateCoachAvatar = impl.updateCoachAvatar;
export const listCoachProfiles = impl.listCoachProfiles;
export const getCoachPublicProfile = impl.getCoachPublicProfile;
export const getCoachAvailability = impl.getCoachAvailability;
export const setCoachAvailabilityRules = impl.setCoachAvailabilityRules;
export const addCoachAvailabilityException = impl.addCoachAvailabilityException;
export const getCoachAvailableSlots = impl.getCoachAvailableSlots;
export const createCoachingRequest = impl.createCoachingRequest;
export const respondToCoachingRequest = impl.respondToCoachingRequest;
export const listCoachingRequestsForCoach = impl.listCoachingRequestsForCoach;
export const listCoachingRequestsForPlayer = impl.listCoachingRequestsForPlayer;
export const listCoachingSessionsForUser = impl.listCoachingSessionsForUser;
export const listAdminCoaches = impl.listAdminCoaches;
export const assignCoachToArena = impl.assignCoachToArena;
