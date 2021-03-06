const cdk = require("@aws-cdk/core");
const ec2 = require("@aws-cdk/aws-ec2");
const iam = require("@aws-cdk/aws-iam");
const s3 = require("@aws-cdk/aws-s3");
const rds = require('@aws-cdk/aws-rds');


export class CdkPipelineStack extends cdk.Stack {
  constructor(scope: any, id: any, props?: any) {
    super(scope, id, props);

    const buildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    new iam.Policy(this, "CodeBuildRolePolicy", {
      statements: [
          new iam.PolicyStatement({
              actions: [
                  "codecommit:GitPull",
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "s3:GetObject",
                  "s3:GetObjectVersion",
                  "s3:PutObject",
                  "ssm:GetParameters"
              ],
              resources: ["*"]
          }),
      ],
      roles: [
          buildRole
      ]
    });
    const deployRole = new iam.Role(this, "CodeDeployRole", {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSCodeDeployRole"),
      ]
    });

    const role = new iam.Role(this, "WebAppInstanceRole", {
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeDeployReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
      ]
    });
    new iam.Policy(this, "DeploymentInstancePolicy", {
    statements: [
        new iam.PolicyStatement({
            actions: [
                "s3:GetObject",
            ],
            resources: ["*"]
        }),
      ],
      roles: [
        role
      ]
    });

    const vpc=new ec2.Vpc(this,'VPC-tsc',{
      cidr:'30.0.0.0/16',
      maxAzs:2,
      subnetConfiguration:[
        {
          subnetType:ec2.SubnetType.PUBLIC,
          name:'VPC-tsc-Public',
          cidrMask:24,
        },
        {
          subnetType:ec2.SubnetType.PRIVATE_ISOLATED,
          name:'VPC-tsc-Private',
          cidrMask:24,
        }
      ], 
      })

    const igwID = vpc.internetGatewayId;
    // Bucket Creation.
    const bucket=new s3.Bucket(this, 'Bharathi-buk0001',{
      bucketName: 'bharathibucket0001',
      versioned: true,
      encryption: s3.BucketEncryption.KMS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    // Creating Security Group.
    const cdksecurityGroup = new ec2.SecurityGroup(this, 'SecurityGroup',{
      vpc: vpc,
      securityGroupName: "CDK-Project",
      description : "Allow SSH for ec2",
      allowAllOutbound : true
    });
    cdksecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh')
    cdksecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow web pages')

    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash -ex" });
    userData.addCommands("yum install -y aws-cli", "yum install -y git", "cd /home/ec2-user/", "wget https://aws-codedeploy-" + cdk.Aws.REGION + ".s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm", "yum -y install codedeploy-agent.noarch.rpm", "service codedeploy-agent start");

    const devInstance = new ec2.Instance(this, 'Dev-Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc ,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: cdksecurityGroup,
      userData: userData,
      instanceName: "Dev-Instance",
      role: role,
      keyName: 'temp',
      
    });
    cdk.Tag.add(devInstance, "Name", "Dev-Instance");
    cdk.Tag.add(devInstance, "App", "DemoApp");
    cdk.Tag.add(devInstance, "Env", "DEV");

    const prodInstance = new ec2.Instance(this, 'Prod-Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc ,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: cdksecurityGroup,
      userData: userData,
      instanceName: "Prod-Instance",
      role: role,
      keyName: 'temp',
    });
    cdk.Tag.add(prodInstance, "Name", "Prod-Instance");
    cdk.Tag.add(prodInstance, "App", "DemoApp");
    cdk.Tag.add(prodInstance, "Env", "PRD");

    const ec2InstancePrivate  = new ec2.Instance(this, 'Private-Instance',{
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc,
      vpcSubnets:{
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroup: cdksecurityGroup,
      userData: userData,
      instanceName: 'Private-Instance',
      role: role,
      keyName: 'temp'
    });

    const rdsSG = new ec2.SecurityGroup(this, 'rds-sg',{
      vpc: vpc,
      securityGroupName: "RDS-SG",
      description: "Access RDS DB",
      allowAllOutbound: true
    });
    rdsSG.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(3306), 'Allow RDS_DB')

    const rdsInstance = new rds.DatabaseInstance(this, 'BharathiRDS', {
      engine: rds.DatabaseInstanceEngine.mysql({ version:rds.MysqlEngineVersion.VER_8_0_25 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
      credentials: rds.Credentials.fromGeneratedSecret('syscdk'), // Optional - will default to 'admin' username and generated password
      databaseName:'bharathiRDS',
      vpc: vpc,
      vpcSubnets: {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      instanceIdentifier:'bharathiRDS',  
      securityGroups: [rdsSG],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    //output
    new cdk.CfnOutput(this, "DevLocation", {
      description: "Development web server location",
      value: "http://" + devInstance.instancePublicDnsName
    })
    new cdk.CfnOutput(this, "PrdLocation", {
      description: "Production web server location",
      value: "http://" + prodInstance.instancePublicDnsName
    })

    new cdk.CfnOutput(this, "BucketName", {
      description: "Bucket for storing artifacts",
      value: bucket.bucketName
    })

    new cdk.CfnOutput(this, "BuildRoleArn", {
      description: "Build role ARN",
      value: buildRole.roleArn
    })

    new cdk.CfnOutput(this, "DeployRoleArn", {
      description: "Deploy role ARN",
      value: deployRole.roleArn
    })
  }
}
