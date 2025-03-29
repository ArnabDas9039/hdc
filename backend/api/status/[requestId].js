export default function handler(req, res) {
  const { requestId } = req.query;
  const approval = pendingApprovals.get(requestId);

  if (!approval) {
    return res.status(404).json({ error: 'Request not found' });
  }

  res.status(200).json({
    status: approval.status,
    filename: approval.filename
  });
}
