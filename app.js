const express = require('express');
const mongoose = require('mongoose');
const app = express();
const cors = require('cors');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
const userLoginSchema = require('./userLoginSchema');
const { uuid } = require('uuidv4');

const port = 8080;

app.use(cors());
app.use(bodyParser.json());
let userlocalData = [];
// AWS Cognito configuration
AWS.config.update({
  region: 'ap-south-1',
  credentials: {
    accessKeyId: 'AKIAZUTX5HVMZ42AKHSI',
    secretAccessKey: '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',
  },
});
const userPoolId = 'ap-south-1_JYPWgcgpB';
const parentPoolclientId = '2ab97v0lke55r95hrt0ong88nc';

const childeUserPoolclientId = '3guc8hjt13m70nrarm0fcrgoc7';
const childeUserPoolId = 'ap-south-1_E9f553PdV';

const parentUserPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: userPoolId,
  ClientId: parentPoolclientId,
});

const childUserPool = new AmazonCognitoIdentity.CognitoUserPool({
  UserPoolId: childeUserPoolId,
  ClientId: childeUserPoolclientId,
});

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.get('/api', (req, res) => {
  // Your data object
  const dataObject = {
    message: 'Hello, this is your data!',
    timestamp: new Date().toISOString(),
  };
  res.json(dataObject);
});

app.post('/api/register', async (req, res) => {
  const { email, password, age, location, parentEmail } = req.body;

  // Check if the required fields are provided
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: `Registration failed ${email}`,
      error: 'All fields are required.',
    });
  }
  let attributeList = [];
  if (parentEmail) {
    attributeList = [
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:age',
        Value: age,
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:location',
        Value: location,
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:isAdult',
        Value: age >= 18 ? 'true' : 'false',
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:parentEmail',
        Value: parentEmail,
      }),
    ];
  } else {
    attributeList = [
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:age',
        Value: age,
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:location',
        Value: location,
      }),
      new AmazonCognitoIdentity.CognitoUserAttribute({
        Name: 'custom:isAdult',
        Value: age >= 18 ? 'true' : 'false',
      }),
    ];
  }
  const signUpPool = age >= 18 ? parentUserPool : childUserPool;
  if (!(age >= 18)) {
    const userIsParentOrChilde = await confirmUserIsParentOrChilde(
      parentEmail,
      'parent',
    );
    let userIsParentOrChildeData = userIsParentOrChilde.find((el) =>
      el?.data?.Username ? el : null,
    );
    if (!userIsParentOrChildeData) {
      return res.status(400).json({
        success: false,
        message: `Registration failed ${email}`,
        error: `Parent email is not authorized. Firstly, register with ${parentEmail} email. Then, register as a child with the same email.`,
      });
    }
  }
  signUpPool.signUp(email, password, attributeList, null, (err, result) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Registration failed ${email}`,
        error: err?.message,
      });
    }
    return res.status(200).json({
      data: result,
    });
  });
});

app.post('/api/verificationCode', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(403).json({
      error: 'Please input your Email..!',
    });
  }
  const userIsParentOrChilde = await confirmUserIsParentOrChilde(email);
  let userIsParentOrChildeData = userIsParentOrChilde.find((el) =>
    el?.data?.Username ? el : null,
  );
  if (userIsParentOrChildeData) {
    const userData = {
      Username: email,
      Pool:
        userIsParentOrChildeData?.type === 'parent'
          ? parentUserPool
          : childUserPool,
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) {
        return res.status(400).json({
          error: 'Error : sending verification code',
        });
      }
      return res.status(200).json({
        message: 'Verification code sent successfully!',
      });
    });
  } else {
    return res.status(400).json({
      success: false,
      message: `Error while sending a Verification code for email: ${email}`,
      error: 'Verification failed..!',
    });
  }
});

app.post('/api/verifyEmail', async (req, res) => {
  const { email, confirmationCode } = req.body;
  const userIsParentOrChilde = await confirmUserIsParentOrChilde(email);
  let userIsParentOrChildeData = userIsParentOrChilde.find((el) =>
    el?.data?.Username ? el : null,
  );
  if (userIsParentOrChildeData) {
    const userData = {
      Username: email,
      Pool:
        userIsParentOrChildeData?.type === 'parent'
          ? parentUserPool
          : childUserPool,
    };
    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.confirmRegistration(confirmationCode, true, (err, result) => {
      if (err) {
        return res.status(400).json({
          error: 'Email confirmation failed',
        });
      }

      return res.status(200).json({
        data: result,
      });
    });
  } else {
    return res.status(400).json({
      success: false,
      message: `Email confirmation failed for ${email}`,
      error: 'Email confirmation failed..!',
    });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const userIsParentOrChilde = await confirmUserIsParentOrChilde(email);
  let userIsParentOrChildeData = userIsParentOrChilde.find((el) =>
    el?.data?.Username ? el : null,
  );
  if (userIsParentOrChildeData) {
    try {
      const authenticationData = {
        Username: email,
        Password: password,
      };

      const authenticationDetails =
        new AmazonCognitoIdentity.AuthenticationDetails(authenticationData);
      const userData = {
        Username: email,
        Pool:
          userIsParentOrChildeData?.type === 'parent'
            ? parentUserPool
            : childUserPool,
      };

      const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (session) => {
          if (session?.idToken?.payload['custom:isAdult'] == 'false') {
            console.log(session?.idToken, 'session?.idToken');
            if (!session?.idToken?.payload['custom:parentEmail']) {
              return res.status(400).json({
                error: 'you’r account not yet link with the parent’s account.',
              });
            } else {
              let uuidToken = uuid();
              const user = new userLoginSchema({
                parentEmail: session?.idToken?.payload['custom:parentEmail'],
                childEmail: session?.idToken?.payload?.email,
                verificationToken: uuidToken,
                isCheck: false,
                subId: session?.idToken?.payload?.sub,
              });
              user.save();
              // userlocalData.push({
              //     parentEmail:session?.idToken?.payload['custom:parentEmail'],
              //     childEmail:session?.idToken?.payload?.email,
              //     verificationToken:uuidToken,
              //     isCheck:false,
              //     id:session?.idToken?.payload?.sub,
              // })
              res.status(200).json({
                success: true,
                message: `Authentication successful`,
                data: {
                  ...session,
                  verificationToken: uuidToken,
                },
              });
            }
          } else {
            res.status(200).json({
              success: true,
              message: `Authentication successful`,
              data: session,
            });
          }
        },
        onFailure: (err) => {
          return res.status(400).json({
            error: err
              ? err?.message
              : 'oops..!, Incorrect username or password',
          });
        },
        newPasswordRequired: function (userAttributes, requiredAttributes) {
          res.status(400).json({
            success: false,
            message: `login failed for ${userAttributes.email}`,
            error: 'oops reset password...!',
          });
        },
      });
    } catch (error) {
      console.error('login failed', error);
      res.status(400).json({
        success: false,
        message: 'login failed',
        error: error.message,
      });
    }
  } else {
    return res.status(400).json({
      success: false,
      message: `login failed for ${email}`,
      error: 'User does not exist...!',
    });
  }
});

app.post('/api/logout', async (req, res) => {
  const { verificationToken, sub } = req.body;
  console.log(verificationToken, sub, 'verificationToken, sub');

  try {
    userLoginSchema
      .findOneAndDelete({ subId: sub, verificationToken: verificationToken })
      .then((userdata) => {
        console.log(userdata, 'data');
        res.status(200).json({
          success: true,
          message: 'User deleted',
        });
      })
      .catch((err) => console.log(err, ''));
  } catch (error) {
    console.error('logout  failed', error);
    res.status(400).json({
      success: false,
      message: 'logout failed',
      error: error.message,
    });
  }
});

app.post('/api/account-verification', async (req, res) => {
  const { verificationToken, sub } = req.body;
  console.log(verificationToken, sub, 'verificationToken, sub');

  try {
    userLoginSchema
      .findOne({ subId: sub, verificationToken: verificationToken })
      .then((userdata) => {
        console.log(userdata, 'data');
        if (userdata?.isCheck) {
          res.status(200).json({
            success: true,
            message: 'User Found',
            data: {
              sub: userdata?.subId,
              verificationToken: userdata?.verificationToken,
              isCheck: userdata?.isCheck,
            },
          });
        } else {
          res.status(400).json({
            success: false,
            message: 'User Not Found',
          });
        }
      })
      .catch((err) => console.log(err, ''));

    // let userdata= userlocalData.find((_)=>(_?.sub === sub && _?.verificationToken === verificationToken) ? _ : null)
  } catch (error) {
    console.error('Registration failed', error);
    res.status(400).json({
      success: false,
      message: 'Registration failed',
      error: error.message,
    });
  }
});

app.post('/api/child-parent-permissions', async (req, res) => {
  const { verificationToken, email } = req.body;
  let filter = { parentEmail: email, verificationToken: verificationToken };
  try {
    let user = await userLoginSchema.findOne(filter);
    console.log(filter, 'child-parent-permissions');
    // let user = userlocalData.find((_)=>(_?.parentEmail === email && _?.verificationToken === verificationToken) ? _ : null)
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'you’r not Authorize parent’s',
      });
    }
    if (user?.isCheck) {
      return (
        user?.isCheck &&
        res.status(200).json({
          success: true,
          message:
            'Child account already verified, \n Ask your child to click on the verification button or refresh the page.',
        })
      );
    }
    let data = await userLoginSchema.findOneAndUpdate(
      filter,
      { isCheck: true },
      { new: true },
    );
    console.log(data);
    //     let userdata= userlocalData.map((_)=>{
    //         if(_?.parentEmail === email && _?.verificationToken === verificationToken) {
    //             return {..._, isCheck:true}
    //         }else{
    //             return _
    //         }
    //     })
    //    userlocalData = userdata;
    res.status(200).json({
      success: true,
      message:
        'Child account verified, \n Ask your child to click on the verification button or refresh the page.',
    });
  } catch (error) {
    console.error('Registration failed', error);
    res.status(400).json({
      success: false,
      message: 'Registration failed',
      error: error.message,
    });
  }
});

const confirmUserIsParentOrChilde = async (email, type) => {
  let userPools =
    type == 'parent'
      ? [{ id: userPoolId, email: email, type: 'parent' }]
      : [
          { id: userPoolId, email: email, type: 'parent' },
          { id: childeUserPoolId, email: email, type: 'childe' },
        ];
  return Promise.all(
    userPools.map(async (_) => {
      let data = await doesUserExist(_?.id, _?.email, _?.type);
      if (data) {
        return data;
      }
    }),
  );
};

async function doesUserExist(userPool, email, type) {
  return new Promise((resolve, reject) => {
    const userData = {
      Username: email,
      UserPoolId: userPool,
    };
    const cognitoIdentityServiceProvider =
      new AWS.CognitoIdentityServiceProvider();
    cognitoIdentityServiceProvider.adminGetUser(userData, (err, data) => {
      console.log(data, 'data', userData);
      if (err) resolve({ error: err, type }); // an error occurred
      else resolve({ data: data, type }); // successful response
    });
  });
}

const startApp = async () => {
  const url =
    'mongodb+srv://tusharshelke:tusharshelke@cluster0.5frir2h.mongodb.net/?retryWrites=true&w=majority';
  const connectionParams = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  };
  await mongoose
    .connect(url, connectionParams)
    .then(() => {
      console.log('Connected to database ');
    })
    .catch((err) => {
      console.error(`Error connecting to the database. \n${err}`);
    });
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
};
startApp();
